import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles, Sphere, MeshDistortMaterial, Stars } from '@react-three/drei';
import * as THREE from 'three';

// A dynamic network particle cloud
function NetworkCloud() {
  const count = 400;
  const mesh = useRef();
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -50 + Math.random() * 100;
      const zFactor = -50 + Math.random() * 100;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      const s = Math.cos(t);
      
      // Follow mouse slightly
      particle.mx += (state.pointer.x * 5 - particle.mx) * 0.02;
      particle.my += (state.pointer.y * 5 - particle.my) * 0.02;
      
      dummy.position.set(
        (particle.mx / 10) + a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
        (particle.my / 10) + b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
        (particle.my / 10) + b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
      );
      dummy.scale.set(s, s, s);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();
      
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    
    // Slow global rotation based on scroll
    mesh.current.rotation.y = state.clock.elapsedTime * 0.05 + (window.scrollY * 0.001);
    mesh.current.rotation.x = window.scrollY * 0.0005;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]}>
      <icosahedronGeometry args={[0.15, 0]} />
      <meshBasicMaterial color="#ff5c35" transparent opacity={0.4} wireframe />
    </instancedMesh>
  );
}

// Core Entity that reacts to scroll and pointer
function CoreNode() {
  const coreRef = useRef();
  
  useFrame((state) => {
    coreRef.current.rotation.y = state.clock.elapsedTime * 0.2;
    coreRef.current.rotation.z = state.clock.elapsedTime * 0.1;
    
    // Smoothly interpolate position based on mouse
    coreRef.current.position.x = THREE.MathUtils.lerp(coreRef.current.position.x, state.pointer.x * 2, 0.05);
    coreRef.current.position.y = THREE.MathUtils.lerp(coreRef.current.position.y, state.pointer.y * 2, 0.05);
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[2.5, 4]} />
        <MeshDistortMaterial 
          color="#0a0a0f" 
          emissive="#ff5c35"
          emissiveIntensity={0.2}
          wireframe={true}
          distort={0.4} 
          speed={2} 
          roughness={0.2}
          transparent
          opacity={0.8}
        />
      </mesh>
    </Float>
  );
}

const InteractiveScene = () => {
  return (
    <div className="w-full h-full absolute inset-0 -z-10 bg-[#050508]">
      <Canvas 
        camera={{ position: [0, 0, 10], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#050508']} />
        
        {/* Ambient lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} color="#ff5c35" />
        <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#14c6cb" />

        {/* Central Abstract Object */}
        <CoreNode />

        {/* Background Network Particles */}
        <NetworkCloud />
        
        {/* Floating Sparkles & Stars */}
        <Sparkles count={200} scale={12} size={2} speed={0.4} color="#ff5c35" opacity={0.5} />
        <Sparkles count={100} scale={15} size={1.5} speed={0.2} color="#14c6cb" opacity={0.3} />
        <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
        
        {/* Fog to hide the edges */}
        <fog attach="fog" args={['#050508', 10, 40]} />
      </Canvas>
    </div>
  );
};

export default InteractiveScene;
