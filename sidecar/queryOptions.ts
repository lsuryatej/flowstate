export function getSharedQueryOptions() {
  return {
    // Packaging: in a bundled .app there is no node_modules for the SDK to
    // require.resolve() its native `claude` binary from, so the Rust host
    // points us at the bundled copy via env. In dev the var is unset and the
    // SDK resolves the binary from node_modules as usual.
    pathToClaudeCodeExecutable: process.env.FLOWSTATE_CLAUDE_BIN || undefined,
  };
}
