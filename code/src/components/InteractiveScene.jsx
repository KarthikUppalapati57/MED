import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const InteractiveScene = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    let width = mountRef.current.clientWidth;
    let height = mountRef.current.clientHeight;
    let frameId;

    // SCENE
    const scene = new THREE.Scene();

    // CAMERA
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 6;

    // RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // CORE OBJECTS
    const group = new THREE.Group();
    scene.add(group);

    // High detail Icosahedron for that "mathematical" feel
    const geometry = new THREE.IcosahedronGeometry(2, 2);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
      blending: THREE.MultiplyBlending
    });

    const sphere = new THREE.Mesh(geometry, wireframeMaterial);
    group.add(sphere);

    // Vertex points (Orange technical dots)
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xff5c35, // Mistral Orange
      size: 0.06,
      transparent: true,
      opacity: 0.6
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    group.add(points);

    // INNER CORE (Subtle glow)
    const innerGeometry = new THREE.IcosahedronGeometry(1.95, 2);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5c35,
      transparent: true,
      opacity: 0.05,
    });
    const innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
    group.add(innerSphere);

    // SECONDARY BACKGROUND PARTICLES (Depth)
    const particlesCount = 300;
    const particlesGeometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(particlesCount * 3);

    for(let i = 0; i < particlesCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 20;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.02,
        color: 0x000000,
        transparent: true,
        opacity: 0.1
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // INTERACTION STATE
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let scrollY = 0;

    const onMouseMove = (event) => {
      mouseX = (event.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      mouseY = (event.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    const onScroll = () => {
        scrollY = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // ANIMATION
    const animate = () => {
      if (document.hidden) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      // Base auto-rotation influenced by scroll (DrinkSOM style)
      group.rotation.y += 0.0015 + (scrollY * 0.03);
      group.rotation.x = targetY * 0.4;
      group.rotation.z = targetX * 0.1 + (scrollY * 0.5);

      // Background particles motion
      particles.rotation.y += 0.0003;
      particles.position.y = scrollY * 3;

      // Subtle scaling core based on scroll
      const scale = 1 + scrollY * 0.3;
      group.scale.set(scale, scale, scale);
      
      // Dynamic Opacity based on scroll
      sphere.material.opacity = 0.15 + (scrollY * 0.1);
      points.material.opacity = 0.6 - (scrollY * 0.3);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      width = mountRef.current.clientWidth;
      height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      wireframeMaterial.dispose();
      pointsMaterial.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
      innerGeometry.dispose();
      innerMaterial.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
};

export default InteractiveScene;
