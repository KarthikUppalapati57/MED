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
    camera.position.z = 5;

    // RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // CORE OBJECTS
    const group = new THREE.Group();
    scene.add(group);

    // Faceted Icosahedron
    const geometry = new THREE.IcosahedronGeometry(1.8, 1);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x14c6cb,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending
    });

    const sphere = new THREE.Mesh(geometry, wireframeMaterial);
    group.add(sphere);

    // Vertex points (glow effect)
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      transparent: true,
      opacity: 0.6
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    group.add(points);

    // SECONDARY BACKGROUND PARTICLES (Depth)
    const particlesCount = 200;
    const particlesGeometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(particlesCount * 3);

    for(let i = 0; i < particlesCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 15;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.015,
        color: 0x14c6cb,
        transparent: true,
        opacity: 0.2
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // MOUSE INTERACTION
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

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('scroll', onScroll);

    // ANIMATION
    const animate = () => {
      // Smoothing
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      // Base auto-rotation influenced by scroll
      group.rotation.y += 0.002 + (scrollY * 0.02);
      group.rotation.x = targetY * 0.3;
      group.rotation.z = targetX * 0.2;

      // Background particles motion
      particles.rotation.y += 0.0005;
      particles.position.y = scrollY * 2;

      // Scaling core based on scroll
      const scale = 1 + scrollY * 0.5;
      group.scale.set(scale, scale, scale);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    animate();

    // RESIZE
    const handleResize = () => {
      if (!mountRef.current) return;
      width = mountRef.current.clientWidth;
      height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // CLEANUP
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      wireframeMaterial.dispose();
      pointsMaterial.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full min-h-[500px]" />;
};

export default InteractiveScene;
