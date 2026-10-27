export type WorkspaceMode = "demo" | "tidecloak";

// Only a deliberate server setting enables the synthetic browser workspace.
// A query string or failed login can never turn authentication into demo mode.
export function workspaceMode(): WorkspaceMode {
  return process.env.WORKSPACE_MODE === "demo" ? "demo" : "tidecloak";
}
