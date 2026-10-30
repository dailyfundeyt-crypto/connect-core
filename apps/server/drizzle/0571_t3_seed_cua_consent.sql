-- Migration 0571 – Seed: CUA-Consent für Stefan (Eigentümer)
-- Eigentümer: A05 (Datenbank-Schema)
-- Idempotent: Zwei Durchläufe ergeben EINEN Consent-Eintrag, nicht zwei.
--
-- Was dieser Seed NICHT ist:
--   - KEIN vorgetäuschter UI-Klick (recorded_by = 'admin', nicht 'user').
--   - KEINE personenbezogenen Inhaltsdaten werden gespeichert.
--   - KEIN automatischer Consent für andere Nutzer.
--
-- Was dieser Seed IST:
--   - Administrativ protokollierte Zustimmung des Eigentümers Stefan Kunc,
--     die er per Chat am 2026-10-29 erteilt hat (source = Protokollreferenz).
--   - machine_settings auf mode='shared' setzen, falls noch kein Eintrag.

DO $$
DECLARE
  v_user_id text;
BEGIN
  -- Nutzer per E-Mail nachschlagen (ohne die E-Mail in Logs zu schreiben)
  SELECT id INTO v_user_id
  FROM users
  WHERE email = 'dailyfunde.yt@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    -- Nutzer nicht gefunden: nichts tun, nur informieren.
    -- Kein RAISE (würde Migration abbrechen); stattdessen stillschweigend
    -- fortfahren – kein Consent-Eintrag, kein machine_settings-Eintrag.
    RAISE NOTICE '0571_t3_seed_cua_consent: Nutzer nicht gefunden – kein Eintrag angelegt.';
    RETURN;
  END IF;

  -- Consent-Eintrag: nur anlegen, wenn noch keiner für scope=cua_install
  -- mit recorded_by=admin und genau dieser Quelle existiert.
  -- Idempotenz: zweiter Durchlauf findet den bestehenden Eintrag und überspringt ihn.
  IF NOT EXISTS (
    SELECT 1
    FROM machine_install_consent
    WHERE user_id     = v_user_id
      AND scope       = 'cua_install'
      AND recorded_by = 'admin'
      AND source      = 'owner consent via chat 2026-10-29'
  ) THEN
    INSERT INTO machine_install_consent (
      id,
      user_id,
      scope,
      source,
      recorded_by,
      recorded_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      'cua_install',
      'owner consent via chat 2026-10-29',
      'admin',
      NOW() AT TIME ZONE 'UTC'
    );
    RAISE NOTICE '0571_t3_seed_cua_consent: Consent-Eintrag angelegt.';
  ELSE
    RAISE NOTICE '0571_t3_seed_cua_consent: Consent-Eintrag bereits vorhanden – übersprungen.';
  END IF;

  -- machine_settings: nur anlegen, falls noch kein Eintrag für diesen Nutzer.
  IF NOT EXISTS (
    SELECT 1 FROM machine_settings WHERE owner_user_id = v_user_id
  ) THEN
    INSERT INTO machine_settings (owner_user_id, mode, updated_at)
    VALUES (v_user_id, 'shared', NOW() AT TIME ZONE 'UTC');
    RAISE NOTICE '0571_t3_seed_cua_consent: machine_settings auf shared gesetzt.';
  ELSE
    RAISE NOTICE '0571_t3_seed_cua_consent: machine_settings bereits vorhanden – übersprungen.';
  END IF;

END $$;
