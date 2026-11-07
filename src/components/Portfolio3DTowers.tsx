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

    const width = container.clientWidth || 720;
    const height = 340;

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

    const gridHelper = new THREE.GridHelper(26, 26, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    const group = new THREE.Group();
    scene.add(group);

    const topPositions = positions.slice(0, 24);
    const maxVal = Math.max(...topPositions.map((p) => p.marketValue), 1);

    const cols = 6;
    const spacingX = 3.0;
    const spacingZ = 2.8;
    const meshes: THREE.Mesh[] = [];

    topPositions.forEach((pos, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = (col - (cols - 1) / 2) * spacingX;
      const z = (row - 1.5) * spacingZ;

      const h = Math.max(0.45, (pos.marketValue / maxVal) * 8.5);
      const geom = new THREE.BoxGeometry(1.35, h, 1.35);
      const isGain = pos.unrealizedPnl >= 0;
      const mat = new THREE.MeshStandardMaterial({
        color: isGain ? 0x10b981 : 0xf43f5e,
        roughness: 0.25,
        metalness: 0.35,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, h / 2, z);
      mesh.userData = { positionSummary: pos };
      group.add(mesh);
      meshes.push(mesh);

      // Gold dividend cap proportional to net dividends paid
      if (pos.netDividendsPaid > 0) {
        const divH = Math.max(0.18, (pos.netDividendsPaid / maxVal) * 4.5);
        const divGeom = new THREE.BoxGeometry(1.38, divH, 1.38);
        const divMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          roughness: 0.2,
          metalness: 0.6,
          emissive: 0x78350f,
          emissiveIntensity: 0.25,
        });
        const divMesh = new THREE.Mesh(divGeom, divMat);
        divMesh.position.set(x, h + divH / 2 + 0.04, z);
        divMesh.userData = { positionSummary: pos };
        group.add(divMesh);
        meshes.push(divMesh);
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
      const w = container.clientWidth || 720;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
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
    <div className="rune-card p-5 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-indigo-400 font-semibold">
            WebGL 3D Spatial Telemetry
          </span>
          <h3 className="text-base font-semibold mt-0.5">
            3D Portfolio Capital &amp; Dividend Yield Towers ({positions.length}{" "}
            Active Holdings)
          </h3>
        </div>
        {/* Visual Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            Unrealized Gain Tower
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
            Unrealized Drawdown Tower
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
            Gold Cap = Net Dividends Collected
          </span>
        </div>
      </div>

      <div
        ref={mountRef}
        className="w-full h-[340px] rounded-xl bg-black/30 border border-white/5 relative"
      />

      {hovered ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono-num font-bold text-indigo-300 text-sm">
              {hovered.ticker}
            </span>
            <span className="text-slate-300">{hovered.name}</span>
            <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300">
              {hovered.shares.toLocaleString()} sh
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono-num">
            <span>
              Mkt Value:{" "}
              <strong className="text-white">
                Rs.{" "}
                {hovered.marketValue.toLocaleString("en-PK", {
                  maximumFractionDigits: 0,
                })}
              </strong>
            </span>
            <span>
              Unrealized P&amp;L:{" "}
              <strong
                className={
                  hovered.unrealizedPnl >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                Rs.{" "}
                {hovered.unrealizedPnl.toLocaleString("en-PK", {
                  maximumFractionDigits: 0,
                })}{" "}
                ({hovered.unrealizedPnlPct.toFixed(1)}%)
              </strong>
            </span>
            <span>
              Net Divs:{" "}
              <strong className="text-amber-300">
                Rs.{" "}
                {hovered.netDividendsPaid.toLocaleString("en-PK", {
                  maximumFractionDigits: 0,
                })}
              </strong>
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-400 flex items-center justify-between">
          <span>
            Drag horizontally to orbit 360° • Hover any tower to inspect capital
            &amp; dividend cap • Click tower to open deep-dive
          </span>
          <span className="font-mono-num text-slate-500">
            Height = Market Value (PKR)
          </span>
        </div>
      )}
    </div>
  );
}
