/* Shader programs linked off the main thread, for the portal's own WebGL
   layers (portal-surface.js, portal-depth.js, portal-effects.js). Asking a
   program for its link status, or for a uniform, before the browser has
   finished compiling it blocks the page until it has: about a second each
   while the page loads. With KHR_parallel_shader_compile the browser can say
   when it is done instead. linkProgramAsync(gl, program) resolves once the
   program has linked (rejecting with its log if it failed); without the
   extension it checks at once, blocking as before. */
window.linkProgramAsync = (gl, program) => new Promise((resolve, reject) => {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const check = () => {
    if (gl.isContextLost()) { reject(new Error('WebGL context lost')); return; }
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) { setTimeout(check, 16); return; }
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) resolve(program);
    else reject(new Error(gl.getProgramInfoLog(program) || 'Shader program failed to link'));
  };
  check();
});
