import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrthographicCamera } from 'three'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

// Real doubles-court dimensions (metres), per BWF law.
const LENGTH = 13.4
const WIDTH = 6.1
const HALF_LENGTH = LENGTH / 2
const HALF_WIDTH = WIDTH / 2
const SINGLES_HALF_WIDTH = 5.18 / 2
const SHORT_SERVICE_Z = 1.98
const LONG_SERVICE_Z = HALF_LENGTH - 0.76
const LINE_THICKNESS = 0.05
const LINE_Y = 0.02
const LINE_COLOR = '#ff6538'
const NET_HEIGHT = 1.55

type LineSpec = { position: [number, number, number]; size: [number, number] }

const COURT_LINES: LineSpec[] = [
  // Doubles sidelines (long, thin in X)
  { position: [HALF_WIDTH, LINE_Y, 0], size: [LINE_THICKNESS, LENGTH] },
  { position: [-HALF_WIDTH, LINE_Y, 0], size: [LINE_THICKNESS, LENGTH] },
  // Singles sidelines
  { position: [SINGLES_HALF_WIDTH, LINE_Y, 0], size: [LINE_THICKNESS, LENGTH] },
  { position: [-SINGLES_HALF_WIDTH, LINE_Y, 0], size: [LINE_THICKNESS, LENGTH] },
  // Back boundary lines (thin in Z, full width)
  { position: [0, LINE_Y, HALF_LENGTH], size: [WIDTH, LINE_THICKNESS] },
  { position: [0, LINE_Y, -HALF_LENGTH], size: [WIDTH, LINE_THICKNESS] },
  // Doubles long service lines
  { position: [0, LINE_Y, LONG_SERVICE_Z], size: [WIDTH, LINE_THICKNESS] },
  { position: [0, LINE_Y, -LONG_SERVICE_Z], size: [WIDTH, LINE_THICKNESS] },
  // Short service lines
  { position: [0, LINE_Y, SHORT_SERVICE_Z], size: [WIDTH, LINE_THICKNESS] },
  { position: [0, LINE_Y, -SHORT_SERVICE_Z], size: [WIDTH, LINE_THICKNESS] },
  // Center lines (short service line to back boundary, each half)
  {
    position: [0, LINE_Y, (SHORT_SERVICE_Z + HALF_LENGTH) / 2],
    size: [LINE_THICKNESS, HALF_LENGTH - SHORT_SERVICE_Z],
  },
  {
    position: [0, LINE_Y, -(SHORT_SERVICE_Z + HALF_LENGTH) / 2],
    size: [LINE_THICKNESS, HALF_LENGTH - SHORT_SERVICE_Z],
  },
]

function CourtLine({ position, size }: LineSpec) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={LINE_COLOR} toneMapped={false} />
    </mesh>
  )
}

function Net() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, NET_HEIGHT / 2, 0]}>
        <planeGeometry args={[WIDTH + 0.1, NET_HEIGHT]} />
        <meshStandardMaterial color="#e9e8e3" transparent opacity={0.22} side={2} />
      </mesh>
      <mesh position={[0, NET_HEIGHT, 0]}>
        <boxGeometry args={[WIDTH + 0.1, 0.04, 0.02]} />
        <meshBasicMaterial color="#f7f3eb" toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (HALF_WIDTH + 0.1), NET_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, NET_HEIGHT, 12]} />
          <meshStandardMaterial color="#ff6538" />
        </mesh>
      ))}
    </group>
  )
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[WIDTH + 3, LENGTH + 3]} />
      <meshStandardMaterial color="#1b1f24" />
    </mesh>
  )
}

// r3f sizes an orthographic camera's visible world-width as `canvas pixel width / zoom`, so a
// fixed zoom value only looks right at the canvas size it was tuned for -- on a narrower canvas
// (e.g. the mobile hero) the same zoom crops in far more than intended. This keeps the visible
// world-width roughly constant (~10 units, matched to how the court frames at the desktop
// hero's ~1184px canvas width and zoom 118) across canvas sizes by scaling zoom with the
// canvas's actual pixel width.
function ResponsiveZoom({ worldWidth = 10 }: { worldWidth?: number }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera
  const width = useThree((state) => state.size.width)
  useEffect(() => {
    // oxlint-disable-next-line immutability -- camera is a real three.js object, not React state
    camera.zoom = width / worldWidth
    camera.updateProjectionMatrix()
  }, [camera, width, worldWidth])
  return null
}

function Scene({ autoRotate }: { autoRotate: boolean }) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <Floor />
      {COURT_LINES.map((line, i) => (
        <CourtLine key={i} {...line} />
      ))}
      <Net />
      <ResponsiveZoom />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        minZoom={12}
        maxZoom={140}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0, 0]}
        makeDefault
      />
    </>
  )
}

export default function BadmintonCourt3D({ spinning = true }: { spinning?: boolean }) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const autoRotate = spinning && !prefersReducedMotion

  return (
    <Canvas
      aria-hidden="true"
      className="badminton-court-canvas"
      dpr={[1, 2]}
      orthographic
      camera={{ position: [9, 9, 9], zoom: 118, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Scene autoRotate={autoRotate} />
    </Canvas>
  )
}
