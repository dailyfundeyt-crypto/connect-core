import folderCreateTool from "./folder_create";
import folderRenameTool from "./folder_rename";
import folderMoveTool from "./folder_move";
import folderMarkSettingsTool from "./folder_mark_settings";
import linkAddTool from "./link_add";
import linkMoveTool from "./link_move";
import noteCreateTool from "./note_create";
import noteReadTool from "./note_read";
import noteUpdateTool from "./note_update";
import noteTrashTool from "./note_trash";
import noteAttachToFolderTool from "./note_attach_to_folder";
import folderContextTool from "./folder_context";

export {
  folderCreateTool,
  folderRenameTool,
  folderMoveTool,
  folderMarkSettingsTool,
  linkAddTool,
  linkMoveTool,
  noteCreateTool,
  noteReadTool,
  noteUpdateTool,
  noteTrashTool,
  noteAttachToFolderTool,
  folderContextTool,
};

export const ALL_SPARK_MCP_TOOLS = [
  folderCreateTool,
  folderRenameTool,
  folderMoveTool,
  folderMarkSettingsTool,
  linkAddTool,
  linkMoveTool,
  noteCreateTool,
  noteReadTool,
  noteUpdateTool,
  noteTrashTool,
  noteAttachToFolderTool,
  folderContextTool,
] as const;

export type SparkToolInstance = (typeof ALL_SPARK_MCP_TOOLS)[number];
