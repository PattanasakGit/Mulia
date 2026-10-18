"use client";

import type { CSSProperties } from "react";

const colors = ["#fffdf5", "#f7efda", "#e8d39d", "#d4a74c", "#a97629"];

function fraction(seed: number) {
  const value = Math.sin(seed * 127.1 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const pieces = Array.from({ length: 76 }, (_, index) => {
  const side = index % 2 === 0 ? "left" : "right";
  const direction = side === "left" ? 1 : -1;
  const spread = 7 + fraction(index + 1) * 43;
  const apex = 32 + fraction(index + 42) * 46;
  const landing = 8 + fraction(index + 83) * 29;
  const width = 3 + fraction(index + 124) * 5;
  const height = index % 5 === 0 ? width : width * (1.6 + fraction(index + 165));

  return {
    side,
    style: {
      "--confetti-apex-x": `${direction * spread}vw`,
      "--confetti-apex-y": `-${apex}vh`,
      "--confetti-end-x": `${direction * (spread + (fraction(index + 206) - 0.5) * 16)}vw`,
      "--confetti-end-y": `-${landing}vh`,
      "--confetti-turn": `${direction * (270 + fraction(index + 247) * 720)}deg`,
      "--confetti-duration": `${1.55 + fraction(index + 288) * 0.55}s`,
      "--confetti-delay": `${fraction(index + 329) * 0.2}s`,
      "--confetti-width": `${width}px`,
      "--confetti-height": `${height}px`,
      "--confetti-color": colors[index % colors.length],
    } as CSSProperties,
  };
});

export function QueueConfetti() {
  return (
    <div className="queue-confetti" aria-hidden="true">
      <span className="queue-confetti-glow is-left" />
      <span className="queue-confetti-glow is-right" />
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={`queue-confetti-piece is-${piece.side}${index % 5 === 0 ? " is-round" : ""}`}
          style={piece.style}
        />
      ))}
    </div>
  );
}
