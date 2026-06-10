import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@/components/ThemeProvider';

// Highly interactive particle wave terrain
function ParticleWave() {
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
      <meshStandardMaterial 
        color="#14c6cb" 
        emissive="#14c6cb"
        emissiveIntensity={0.8}
        wireframe={true}
        transparent 
        opacity={0.6} 
      />
    </instancedMesh>
  );
}

// Custom Stars that properly respect the color prop (unlike drei's Stars)
function CustomStars({ isDark }) {
  const count = 8000;
  const positions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    return positions;
  }, []);

  const ref = useRef();
  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y -= delta * 0.05;
      ref.current.rotation.x -= delta * 0.02;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={isDark ? 0.5 : 1.2}
        color={isDark ? "#ffffff" : "#000000"}
        transparent
        opacity={isDark ? 0.7 : 0.3}
        sizeAttenuation={true}
        depthWrite={false}
      />
    </points>
  );
}

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
          <ParticleWave />
        </Float>
        
        {/* Background elements (Orange & Teal sparkles) */}
        <Sparkles count={400} scale={30} size={3} speed={0.8} color="#ff5c35" opacity={isDark ? 0.6 : 0.3} />
        <Sparkles count={200} scale={30} size={2} speed={0.5} color="#14c6cb" opacity={isDark ? 0.4 : 0.2} />
        
        {/* Deep starfield (Custom implementation to fix color issue) */}
        <CustomStars isDark={isDark} />
        
        {/* Fog to cut off the grid elegantly in the distance */}
        <fog attach="fog" args={[bgColor, 10, 30]} />
      </Canvas>
    </div>
  );
};

export default InteractiveScene;
