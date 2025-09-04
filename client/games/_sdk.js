// SDK: the shell calls into per-game modules for UI concerns.
// Each game client module exports:
//   export const meta = { key, name, description };
//   export function renderHost(ctx, state) {}
//   export function renderPlayer(ctx, state) {}
//   export function renderHostSettings?(ctx, state) {}  // optional
//
// The shell provides ctx: { socket, el: id=>node, show(node,bool), escapeHtml(str), isHost(), isVIP(), stateRef }
// Games can emit events with ctx.socket.emit('game:event', { code: state.code, type, payload })

export function makeCtx({ socket, helpers, stateRef }) {
  return {
    socket,
    ...helpers,
    stateRef
  };
}
