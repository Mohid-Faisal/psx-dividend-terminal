"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PositionSummary } from "@/types/portfolio";

interface Props {
  positions: PositionSummary[];
  onSelectTicker: (ticker: string) => void;
}

export default function Portfolio3DTowers({
  positions,
  onSelectTicker,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<PositionSummary | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || positions.length === 0) return;

    const width = container.clientWidth || 680;
    const height = container.clientHeight || 340;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 14.5, 22);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
    dirLight.position.set(12, 24, 16);
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(28, 16, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    const group = new THREE.Group();
    scene.add(group);

    const topPositions = [...positions]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 24);
    const maxVal = Math.max(...topPositions.map((p) => p.marketValue), 1);

    const cols = 6;
    const spacingX = 2.9;
    const spacingZ = 2.9;
    const meshes: THREE.Mesh[] = [];

    topPositions.forEach((pos, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = (col - (cols - 1) / 2) * spacingX;
      const z = (row - 1.5) * spacingZ;

      const h = Math.max(0.55, (pos.marketValue / maxVal) * 8.8);
      const geom = new THREE.BoxGeometry(1.35, h, 1.35);
      const isGain = pos.totalReturn >= 0;
      const mat = new THREE.MeshStandardMaterial({
        color: isGain ? 0x10b981 : 0xf43f5e,
        roughness: 0.28,
        metalness: 0.25,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, h / 2, z);
      mesh.userData = { positionSummary: pos };
      group.add(mesh);
      meshes.push(mesh);

      if (pos.netDividendsPaid > 0) {
        const ringGeom = new THREE.TorusGeometry(0.95, 0.06, 10, 28);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, h + 0.3, z);
        group.add(ring);
      }
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isDragging = false;
    let prevX = 0;

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const dx = e.clientX - prevX;
        group.rotation.y += dx * 0.01;
        prevX = e.clientX;
      }

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hitPos = hits[0].object.userData
          .positionSummary as PositionSummary;
        setHovered(hitPos);
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHovered(null);
        renderer.domElement.style.cursor = isDragging ? "grabbing" : "grab";
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hitPos = hits[0].object.userData
          .positionSummary as PositionSummary;
        if (hitPos) onSelectTicker(hitPos.ticker);
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener("mousemove", onPointerMove);
    domEl.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mouseup", onPointerUp);
    domEl.addEventListener("click", onClick);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging) {
        group.rotation.y += 0.0022;
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 680;
      const h = container.clientHeight || 340;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      domEl.removeEventListener("mousemove", onPointerMove);
      domEl.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mouseup", onPointerUp);
      domEl.removeEventListener("click", onClick);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [positions, onSelectTicker]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            left: "12px",
            background: "rgba(15, 23, 42, 0.94)",
            border: "1px solid #38bdf8",
            padding: "8px 12px",
            borderRadius: "6px",
            color: "#ffffff",
            fontSize: "12px",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <div className="fw-700" style={{ color: "#38bdf8" }}>
            {hovered.ticker} — {hovered.name}
          </div>
          <div className="mono">
            Value: Rs. {Math.round(hovered.marketValue).toLocaleString()}
          </div>
          <div
            className="mono"
            style={{
              color: hovered.totalReturn >= 0 ? "#34d399" : "#fb7185",
            }}
          >
            Total Return: {hovered.totalReturn >= 0 ? "+" : "-"}Rs.{" "}
            {Math.round(Math.abs(hovered.totalReturn)).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
