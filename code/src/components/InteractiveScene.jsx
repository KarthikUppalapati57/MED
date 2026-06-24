import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@/components/ThemeProvider';

// Highly interactive particle wave terrain
function ParticleWave({ isDark }) {
  const count = 2500; // 50x50 grid
  const mesh = useRef();
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Create a grid of points
  const particles = useMemo(() => {
    const temp = [];
    const size = Math.sqrt(count);
    const spacing = 1.2;
    const offset = (size * spacing) / 2;
    
    for (let i = 0; i < count; i++) {
      const x = (i % size) * spacing - offset;
      const z = Math.floor(i / size) * spacing - offset;
      temp.push({ x, z, phase: Math.random() * Math.PI * 2 });
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Calculate scroll progress (0 to ~1000s)
    const scrollY = window.scrollY;
    
    // Smooth pointer data mapped to world space coordinates
    const pointerX = state.pointer.x * 20; // Spread interaction area
    const pointerY = state.pointer.y * -20; // Invert Y for correct mapping in 3D

    particles.forEach((particle, i) => {
      // Base math wave animation (like an ocean of data)
      const waveX = Math.sin(particle.x * 0.3 + time * 0.5 + particle.phase * 0.1);
      const waveZ = Math.cos(particle.z * 0.3 + time * 0.5);
      
      let targetY = waveX * waveZ * 2.5;
      
      // Interactive mouse ripple: particles surge up when mouse is near
      const distanceToMouse = Math.sqrt(
        Math.pow(particle.x - pointerX, 2) + Math.pow(particle.z - pointerY, 2)
      );
      
      if (distanceToMouse < 6) {
         // Create a massive ripple peak if close to mouse
         const ripple = Math.sin((6 - distanceToMouse) * Math.PI * 0.5);
         targetY += ripple * 3;
      }
      
      // Add global scroll offset effect (terrain lifts up dynamically on scroll)
      targetY += (scrollY * 0.01);

      dummy.position.set(particle.x, targetY, particle.z);
      
      // Scale based on height so peaks look larger
      const scale = 0.15 + Math.max(0, targetY * 0.15);
      dummy.scale.set(scale, scale, scale);
      
      // Rotate the individual geometries based on time
      dummy.rotation.x = time * 0.5 + particle.phase;
      dummy.rotation.y = time * 0.5 + particle.phase;
      
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    
    mesh.current.instanceMatrix.needsUpdate = true;
    
    // Slowly rotate the entire grid
    mesh.current.rotation.y = time * 0.02;
    
    // --- DRAMATIC CAMERA SCROLL TRACKING ---
    // Start at z=20, fly *through* the terrain to z=5 as you scroll down
    const targetCamZ = Math.max(5, 20 - (scrollY * 0.02));
    // Start high, swoop down close to the terrain
    const targetCamY = Math.max(2, 8 - (scrollY * 0.005));
    
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetCamZ, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetCamY, 0.05);
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]}>
      {/* Octahedrons look incredible when wireframed */}
      <octahedronGeometry args={[0.3, 0]} />
      {(() => {
        const accentColor = isDark ? '#14c6cb' : '#22c55e';
        return (
      <meshStandardMaterial 
        color={accentColor}
        emissive={accentColor}
        emissiveIntensity={0.8}
        wireframe={true}
        transparent 
        opacity={0.6} 
      />
        );
      })()}
    </instancedMesh>
  );
}

// Highly polished Stars wrapper that correctly forces colors without losing drei's shader quality
const ThemedStars = ({ isDark }) => {
  const starsRef = useRef();
  
  // We use the exact same highly polished Stars from drei, but we forcefully 
  // rewrite the vertex color buffer and adjust blending to respect our light/dark mode.
  React.useEffect(() => {
    if (starsRef.current) {
      const geometry = starsRef.current.geometry;
      const material = starsRef.current.material;
      const colorAttribute = geometry.attributes.color;
      
      if (colorAttribute) {
        const count = colorAttribute.count;
        const targetColor = new THREE.Color(isDark ? '#ffffff' : '#000000');
        
        for (let i = 0; i < count; i++) {
          colorAttribute.setXYZ(i, targetColor.r, targetColor.g, targetColor.b);
        }
        colorAttribute.needsUpdate = true;
      }
      
      if (material) {
        // AdditiveBlending makes black/colored stars invisible on a white background.
        // We must use NormalBlending in light mode so they show up.
        material.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
        material.transparent = true;
        material.needsUpdate = true;
      }
    }
  }, [isDark]);

  return (
    <Stars 
      ref={starsRef} 
      radius={100} 
      depth={50} 
      count={8000} 
      factor={isDark ? 4 : 4} 
      saturation={0} 
      fade 
      speed={2} 
    />
  );
};

// Wrapper for Sparkles to fix AdditiveBlending in light mode
const ThemedSparkles = ({ isDark, ...props }) => {
  const sparklesRef = useRef();

  React.useEffect(() => {
    if (sparklesRef.current) {
      const material = sparklesRef.current.material;
      if (material) {
        material.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
        material.needsUpdate = true;
      }
    }
  }, [isDark]);

  return <Sparkles ref={sparklesRef} {...props} />;
};

const InteractiveScene = () => {
  const { theme } = useTheme();
  
  // Resolve actual theme if set to 'system'
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const bgColor = isDark ? '#050508' : '#ffffff';

  return (
    <div className="w-full h-full absolute inset-0 -z-10 bg-transparent">
      <Canvas 
        camera={{ position: [0, 8, 20], fov: 60 }}
        dpr={[1, 2]} // High DPI for crisp lines
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[bgColor]} />
        
        {/* Intense lighting for reflections */}
        <ambientLight intensity={isDark ? 0.5 : 0.8} />
        <spotLight position={[0, 20, 0]} penumbra={1} intensity={isDark ? 3 : 1.5} color="#ff5c35" castShadow />
        <pointLight position={[-10, 5, -10]} intensity={isDark ? 4 : 2} color="#ff5c35" />
        <pointLight position={[10, 5, 10]} intensity={isDark ? 2 : 1} color="#14c6cb" />

        {/* The massive interactive terrain */}
        <Float speed={1.5} floatIntensity={0.5} rotationIntensity={0.1}>
          <ParticleWave isDark={isDark} />
        </Float>
        
        {/* Background elements (Orange & Teal sparkles) - Use wrapper to fix blending */}
        <ThemedSparkles isDark={isDark} count={400} scale={30} size={isDark ? 3 : 4} speed={0.8} color="#ff5c35" opacity={isDark ? 0.6 : 0.8} />
        <ThemedSparkles isDark={isDark} count={200} scale={30} size={isDark ? 2 : 3} speed={0.5} color={isDark ? '#14c6cb' : '#22c55e'} opacity={isDark ? 0.4 : 0.6} />
        
        {/* Deep starfield (Restored professional version with forced colors) */}
        <ThemedStars isDark={isDark} />
        
        {/* Fog to cut off the grid elegantly in the distance */}
        <fog attach="fog" args={[bgColor, 10, 30]} />
      </Canvas>
    </div>
  );
};

export default InteractiveScene;
