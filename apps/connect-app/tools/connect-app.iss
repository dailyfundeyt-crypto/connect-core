; Connect App - Inno Setup Script (Inno Setup 6/7)
; Bauen:  tools\build-installer.ps1   (ruft build-bundle, scan-secrets und ISCC auf)
#ifndef AppVer
  #define AppVer "1.1.0"
#endif
#define Src ".."

[Setup]
AppId={{8C1F5B0E-6D4A-4C7B-9E2A-3B5D7A1C4E90}
AppName=Connect App
AppVersion={#AppVer}
AppVerName=Connect App {#AppVer}
AppPublisher=Kunc GmbH
VersionInfoVersion={#AppVer}
VersionInfoDescription=Connect App Setup
DefaultDirName={autopf}\Connect App
DefaultGroupName=Connect App
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Src}\dist
OutputBaseFilename=ConnectApp-Setup-{#AppVer}
SetupIconFile={#Src}\connect-app.ico
UninstallDisplayIcon={app}\Connect.exe
UninstallDisplayName=Connect App
Compression=lzma2/normal
SolidCompression=yes
LZMANumBlockThreads=6
WizardStyle=modern
CloseApplications=yes
SetupLogging=yes

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; Bei Updates alten Programmcode sauber ersetzen. Die DATEN liegen in %LOCALAPPDATA%\ConnectApp und bleiben.
Type: filesandordirs; Name: "{app}\runtime\connect"
Type: filesandordirs; Name: "{app}\extension"
Type: filesandordirs; Name: "{app}\helium"

[Files]
Source: "{#Src}\Connect.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\connect-app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\connect-app.json"; DestDir: "{app}"; Flags: onlyifdoesntexist
Source: "{#Src}\helium\*"; DestDir: "{app}\helium"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Src}\extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Src}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Connect App"; Filename: "{app}\Connect.exe"; WorkingDir: "{app}"; IconFilename: "{app}\connect-app.ico"; AppUserModelID: "KuncGmbH.ConnectApp"; Comment: "Connect App"
Name: "{autoprograms}\Connect App - Backup erstellen"; Filename: "{app}\Connect.exe"; Parameters: "--backup"; WorkingDir: "{app}"; IconFilename: "{app}\connect-app.ico"
Name: "{autoprograms}\Connect App - Datenordner"; Filename: "{app}\Connect.exe"; Parameters: "--open-data"; WorkingDir: "{app}"; IconFilename: "{app}\connect-app.ico"
Name: "{autodesktop}\Connect App"; Filename: "{app}\Connect.exe"; WorkingDir: "{app}"; IconFilename: "{app}\connect-app.ico"; AppUserModelID: "KuncGmbH.ConnectApp"; Tasks: desktopicon

[Run]
Filename: "{app}\Connect.exe"; Description: "{cm:LaunchProgram,Connect App}"; Flags: nowait postinstall skipifsilent

[Code]
const
  AppMutexName = 'Local\KuncGmbH.ConnectApp.Main';

{ Laufende Connect App (Fenster + Server + Datenbank) sauber beenden, bevor Dateien ersetzt/entfernt werden. }
function StopRunningApp(const Exe: String; Silent: Boolean): Boolean;
var
  rc, i: Integer;
begin
  Result := True;
  if not CheckForMutexes(AppMutexName) then exit;
  if not FileExists(Exe) then exit;
  if (not Silent) and (MsgBox('Connect App laeuft gerade. Jetzt beenden und fortfahren?' #13#10 +
      '(Ihre Daten bleiben erhalten.)', mbConfirmation, MB_YESNO) <> IDYES) then
  begin
    Result := False;
    exit;
  end;
  Exec(Exe, '--stop', '', SW_HIDE, ewWaitUntilTerminated, rc);
  for i := 0 to 20 do
  begin
    if not CheckForMutexes(AppMutexName) then break;
    Sleep(500);
  end;
  Sleep(1500);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not StopRunningApp(ExpandConstant('{app}\Connect.exe'), WizardSilent) then
    Result := 'Connect App laeuft noch. Bitte schliessen und Setup erneut starten.';
end;

function InitializeUninstall(): Boolean;
begin
  Result := StopRunningApp(ExpandConstant('{app}\Connect.exe'), UninstallSilent);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and (not UninstallSilent) then
    MsgBox('Connect App wurde entfernt.' #13#10#13#10 +
      'Ihre Daten (Datenbank, Profil, Agents, Sidebar, Backups) bleiben erhalten in:' #13#10 +
      ExpandConstant('{localappdata}\ConnectApp') + #13#10#13#10 +
      'Bei einer Neuinstallation sind sie sofort wieder da. Zum endgueltigen Loeschen diesen Ordner manuell entfernen.',
      mbInformation, MB_OK);
end;
