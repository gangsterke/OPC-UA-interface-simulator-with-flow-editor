import { dialog, type BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import type { Project } from "@shared/models/project";
import { projectSchema } from "./project-schema";

const FILE_FILTERS = [{ name: "Interface Simulator Project", extensions: ["ifsim.json"] }];

// Username/password auth must never be written to disk in plaintext - the
// project file is meant to be version-controlled. On load, an absent
// password just means the user re-enters it for that session.
function stripSecrets(project: Project): Project {
  if (project.connectionProfile.authentication.kind !== "usernamePassword") {
    return project;
  }
  return {
    ...project,
    connectionProfile: {
      ...project.connectionProfile,
      authentication: { ...project.connectionProfile.authentication, password: "" },
    },
  };
}

export async function promptSaveProjectPath(window: BrowserWindow | null): Promise<string | null> {
  const options = { title: "Save Project", defaultPath: "project.ifsim.json", filters: FILE_FILTERS };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

export async function promptOpenProjectPath(window: BrowserWindow | null): Promise<string | null> {
  const options = { title: "Open Project", filters: FILE_FILTERS, properties: ["openFile" as const] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

export async function writeProjectFile(project: Project, filePath: string): Promise<void> {
  const sanitized = stripSecrets(project);
  await writeFile(filePath, JSON.stringify(sanitized, null, 2), "utf-8");
}

export async function readProjectFile(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("File is not valid JSON");
  }
  const result = projectSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new Error(`Project file failed validation:\n${issues.join("\n")}`);
  }
  return result.data;
}
