import type { Backend } from "./adapters/types";

export type DemoItem = {
  id: string;
  title: string;
  backend: Backend;
  sourceGL?: { vertex: string; fragment: string };
  sourceWGSL?: string;
};

const GL1_VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const GL1_FRAG = `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float d = distance(uv, u_mouse / u_resolution);
  vec3 col = 0.5 + 0.5 * cos(u_time + vec3(0.0,2.0,4.0) + d*6.2831);
  gl_FragColor = vec4(col, 1.0);
}
`;

const GL3_VERT = `#version 300 es
in vec2 a_position;
void main(){
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const GL3_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float s = 0.5 + 0.5 * sin(u_time*2.0 + uv.x*10.0 + uv.y*7.0);
  outColor = vec4(uv, s, 1.0);
}
`;

const WGSL = `
@group(0) @binding(0) var<uniform> u0: vec4<f32>;
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  return vec4<f32>(pos[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
  let t = u0.x;
  let res = vec2<f32>(u0.y, u0.z);
  let uv = p.xy / res;
  let c = vec3<f32>(uv, 0.5 + 0.5 * sin(t*2.0 + uv.x*8.0 + uv.y*6.0));
  return vec4<f32>(c, 1.0);
}
`;

export const DEFAULT_DEMOS: DemoItem[] = [
  { id: "gl1-basic", title: "GLSL ES 1.0 彩色", backend: "webgl", sourceGL: { vertex: GL1_VERT, fragment: GL1_FRAG } },
  { id: "gl3-basic", title: "GLSL ES 3.0 渐变", backend: "webgl2", sourceGL: { vertex: GL3_VERT, fragment: GL3_FRAG } },
  { id: "wgsl-basic", title: "WGSL 动态色", backend: "webgpu", sourceWGSL: WGSL },
];


