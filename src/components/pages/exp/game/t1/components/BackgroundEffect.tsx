import { createEffect, onCleanup, onMount } from "solid-js";

export type BackgroundTheme = "default" | "danger" | "victory" | "mystic" | "calm" | "void" | "elite" | "boss" | "event" | "treasure";

interface BackgroundEffectProps {
  theme?: BackgroundTheme;
  speed?: number;
  direction?: [number, number]; // [x, y] flow direction
  intensity?: number;
  class?: string;
}

const THEMES: Record<BackgroundTheme, [number, number, number][]> = {
  default: [
    [0.02, 0.02, 0.06], // Dark deep space
    [0.12, 0.08, 0.25], // Deep purple/blue
    [0.0, 0.35, 0.45],  // Cyan/Teal accent
  ],
  danger: [
    [0.05, 0.0, 0.0],   // Dark red
    [0.3, 0.05, 0.05],  // Crimson
    [0.6, 0.1, 0.0],    // Bright red/orange
  ],
  victory: [
    [0.1, 0.1, 0.0],    // Dark gold
    [0.4, 0.3, 0.1],    // Gold
    [0.8, 0.7, 0.2],    // Bright gold/yellow
  ],
  mystic: [
    [0.05, 0.0, 0.1],   // Dark violet
    [0.2, 0.0, 0.4],    // Purple
    [0.4, 0.1, 0.7],    // Pink/Magenta
  ],
  calm: [
    [0.0, 0.05, 0.02],  // Dark green
    [0.0, 0.2, 0.15],   // Emerald
    [0.1, 0.5, 0.4],    // Teal/Green
  ],
  void: [
    [0.0, 0.0, 0.0],    // Black
    [0.1, 0.1, 0.1],    // Dark Gray
    [0.3, 0.3, 0.3],    // Gray
  ],
  elite: [
    [0.05, 0.02, 0.0],  // Dark Brown
    [0.3, 0.1, 0.0],    // Rust
    [0.6, 0.2, 0.0],    // Orange
  ],
  boss: [
    [0.0, 0.0, 0.05],   // Deep Blue Black
    [0.1, 0.0, 0.2],    // Dark Purple
    [0.5, 0.0, 0.1],    // Blood Red
  ],
  event: [
    [0.02, 0.02, 0.05], // Dark Blue
    [0.1, 0.1, 0.3],    // Blue
    [0.3, 0.0, 0.6],    // Purple
  ],
  treasure: [
    [0.05, 0.05, 0.0],  // Dark Yellow
    [0.2, 0.2, 0.0],    // Olive
    [0.6, 0.5, 0.1],    // Gold
  ]
};

export const BackgroundEffect = (props: BackgroundEffectProps) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let animationFrameId: number;
  let gl: WebGLRenderingContext | null = null;
  
  // Default values
  const getTheme = () => THEMES[props.theme || "default"];
  const getSpeed = () => props.speed ?? 0.5;
  const getDirection = () => props.direction ?? [0.15, 0.126];
  const getIntensity = () => props.intensity ?? 1.5;

  const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec3 u_color1;
    uniform vec3 u_color2;
    uniform vec3 u_color3;
    uniform float u_speed;
    uniform vec2 u_flow;
    uniform float u_intensity;

    // 2D Random
    float random (in vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // 2D Noise based on Morgan McGuire @morgan3d
    float noise (in vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);

        // Four corners in 2D of a tile
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));

        // Smooth Interpolation
        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(a, b, u.x) +
                (c - a)* u.y * (1.0 - u.x) +
                (d - b) * u.x * u.y;
    }

    // Fractal Brownian Motion
    #define OCTAVES 5
    float fbm (in vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 0.0;
        
        // Loop of octaves
        for (int i = 0; i < OCTAVES; i++) {
            value += amplitude * noise(st);
            st *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    void main() {
        vec2 st = gl_FragCoord.xy/u_resolution.xy;
        st.x *= u_resolution.x/u_resolution.y; // Correct aspect ratio

        float time = u_time * u_speed; 

        // Domain Warping
        // f(p) = fbm( p + fbm( p + fbm( p ) ) )
        
        vec2 q = vec2(0.);
        q.x = fbm( st + 0.00*time);
        q.y = fbm( st + vec2(1.0));

        vec2 r = vec2(0.);
        // Apply flow direction to the warping
        r.x = fbm( st + 1.0*q + vec2(1.7,9.2)+ u_flow.x*time );
        r.y = fbm( st + 1.0*q + vec2(8.3,2.8)+ u_flow.y*time);

        float f = fbm(st + r);

        // Color palette mixing
        vec3 color = vec3(0.0);
        
        // Mix colors based on the domain warped values
        color = mix(u_color1, u_color2, clamp((f*f)*4.0, 0.0, 1.0));
        color = mix(color, u_color3, clamp(length(q), 0.0, 1.0));
        
        // Add brightness to the "ridges" of the flow
        // Using a lighter version of color3 or a generic light for ridges
        vec3 ridgeColor = mix(u_color3, vec3(1.0), 0.3);
        color = mix(color, ridgeColor, clamp(length(r.x), 0.0, 1.0));

        // Enhance contrast and brightness curve
        vec3 finalColor = (f*f*f + 0.6*f*f + 0.5*f) * color * u_intensity;

        // Vignette
        vec2 center = gl_FragCoord.xy / u_resolution.xy - 0.5;
        // Correct aspect for vignette to be circular
        center.x *= u_resolution.x/u_resolution.y;
        float dist = length(center);
        finalColor *= 1.0 - smoothstep(0.5, 1.8, dist);

        gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  onMount(() => {
    if (!canvasRef) return;

    let cleanupResize: (() => void) | undefined;
    
    // Try standard WebGL first, then experimental
    gl = canvasRef.getContext("webgl") || (canvasRef.getContext("experimental-webgl") as WebGLRenderingContext);
    
    if (!gl) {
      console.error("WebGL not supported");
      return;
    }

    const initGL = () => {
      if (!gl) return;
      if (cleanupResize) cleanupResize();

      const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          return shader;
        }
        console.error("Shader Compile Error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      };

      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

      if (!vertexShader || !fragmentShader) return;

      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program Link Error:", gl.getProgramInfoLog(program));
        return;
      }

      gl.useProgram(program);

      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = [
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      const locations = {
        time: gl.getUniformLocation(program, "u_time"),
        resolution: gl.getUniformLocation(program, "u_resolution"),
        color1: gl.getUniformLocation(program, "u_color1"),
        color2: gl.getUniformLocation(program, "u_color2"),
        color3: gl.getUniformLocation(program, "u_color3"),
        speed: gl.getUniformLocation(program, "u_speed"),
        flow: gl.getUniformLocation(program, "u_flow"),
        intensity: gl.getUniformLocation(program, "u_intensity"),
      };

      const handleResize = () => {
        if (!canvasRef || !gl) return;
        const dpr = window.devicePixelRatio || 1;
        const targetDpr = Math.min(dpr, 2.0); // Limit max dpr for performance
        
        canvasRef.width = window.innerWidth * targetDpr;
        canvasRef.height = window.innerHeight * targetDpr;
        
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        if(locations.resolution) gl.uniform2f(locations.resolution, gl.canvas.width, gl.canvas.height);
      };
      
      window.addEventListener('resize', handleResize);
      cleanupResize = () => window.removeEventListener('resize', handleResize);
      handleResize();

      const startTime = performance.now();
      const render = (time: number) => {
        if (!gl) return;
        if(locations.time) gl.uniform1f(locations.time, (time - startTime) * 0.001);
        
        const colors = getTheme();
        if(locations.color1) gl.uniform3fv(locations.color1, colors[0]);
        if(locations.color2) gl.uniform3fv(locations.color2, colors[1]);
        if(locations.color3) gl.uniform3fv(locations.color3, colors[2]);
        if(locations.speed) gl.uniform1f(locations.speed, getSpeed());
        if(locations.flow) gl.uniform2fv(locations.flow, getDirection());
        if(locations.intensity) gl.uniform1f(locations.intensity, getIntensity());

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        animationFrameId = requestAnimationFrame(render);
      };
      
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(render);
    };

    // Handle context loss
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(animationFrameId);
    };

    const handleContextRestored = () => {
      initGL();
    };

    canvasRef.addEventListener('webglcontextlost', handleContextLost, false);
    canvasRef.addEventListener('webglcontextrestored', handleContextRestored, false);

    initGL();

    onCleanup(() => {
      cancelAnimationFrame(animationFrameId);
      if (cleanupResize) cleanupResize();
      if (canvasRef) {
        canvasRef.removeEventListener('webglcontextlost', handleContextLost);
        canvasRef.removeEventListener('webglcontextrestored', handleContextRestored);
      }
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    });
  });

  return (
    <canvas
      ref={canvasRef}
      class={`absolute inset-0 w-full h-full pointer-events-none z-0 opacity-80 ${props.class || ''}`}
    />
  );
};
