// Ocean shader using Gerstner waves (same physics as three.js Water)
// Realistic wave simulation for Dubai's coastal waters
import * as THREE from "three";

export const oceanVertexShader = `
  uniform sampler2D heightmap;
  uniform float time;
  uniform float scale;

  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  // Gerstner wave function for realistic ocean surfaces
  vec3 gerstnerWave(vec4 wave, vec3 p) {
    float steepness = wave.z;
    float wavelength = wave.w;
    float k = 2.0 * 3.14159 / wavelength;
    float c = sqrt(9.8 / k);
    float d = normalize(wave.xy).x;
    float f = k * (d * p.x + normalize(wave.xy).y * p.z - c * time);
    float a = steepness / k;

    return vec3(
      d * (a * cos(f)),
      a * sin(f),
      normalize(wave.xy).y * (a * cos(f))
    );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Subtle Gerstner waves — premium soft movement, not cartoonish
    // Reduced wave steepness (0.1-0.15 instead of 0.25) for smooth shimmer
    vec4 wave1 = vec4(1.0, 0.0, 0.1, 60.0);
    vec4 wave2 = vec4(0.2, 0.4, 0.08, 31.0);
    vec4 wave3 = vec4(0.5, 0.1, 0.06, 18.0);

    pos += gerstnerWave(wave1, position);
    pos += gerstnerWave(wave2, position);
    pos += gerstnerWave(wave3, position);

    vPosition = pos;
    vElevation = pos.y;

    // Compute normal via finite differences for lighting
    float eps = 0.1;
    vec3 p1 = pos;
    vec3 p2 = pos + vec3(eps, 0.0, 0.0);
    vec3 p3 = pos + vec3(0.0, 0.0, eps);

    p2 += gerstnerWave(wave1, p2) + gerstnerWave(wave2, p2) + gerstnerWave(wave3, p2);
    p3 += gerstnerWave(wave1, p3) + gerstnerWave(wave2, p3) + gerstnerWave(wave3, p3);

    vNormal = normalize(cross(p2 - p1, p3 - p1));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const oceanFragmentShader = `
  uniform vec3 waterColor;
  uniform vec3 skyColor;
  uniform float transparency;
  uniform float shininess;

  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  void main() {
    // Subtle Fresnel effect — premium water doesn't over-reflect
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - dot(viewDir, vNormal), 3.0) * 0.4 + 0.2;

    // Soft specular highlight — reduced intensity for subtlety
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    float spec = pow(max(dot(reflect(-lightDir, vNormal), viewDir), 0.0), shininess);

    // Blend water base color with subtle sky reflection
    vec3 color = mix(waterColor, skyColor, fresnel);
    color += vec3(1.0) * spec * 0.15; // very subtle highlight

    // Minimal wave pattern — just a hint of texture
    float wave = sin(vUv.x * 8.0 + vPosition.y * 0.3) * 0.05;
    color += vec3(wave * 0.05);

    gl_FragColor = vec4(color, transparency);
  }
`;

// Create ocean material with Gerstner wave shader
export function createOceanMaterial(config: {
  waterColor?: THREE.Color;
  skyColor?: THREE.Color;
  transparency?: number;
  shininess?: number;
} = {}): THREE.ShaderMaterial {
  const {
    waterColor = new THREE.Color(0x5edfff),
    skyColor = new THREE.Color(0xb3e5fc),
    transparency = 0.8,
    shininess = 32.0,
  } = config;

  return new THREE.ShaderMaterial({
    uniforms: {
      waterColor: { value: waterColor },
      skyColor: { value: skyColor },
      transparency: { value: transparency },
      shininess: { value: shininess },
      time: { value: 0.0 },
      scale: { value: 1.0 },
      heightmap: { value: new THREE.Texture() },
    },
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}
