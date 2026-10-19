import React, { useEffect, useRef, useState } from 'react';

interface CircleCaptchaProps {
  onSuccess: () => void;
  onFail: () => void;
}

export const CircleCaptcha: React.FC<CircleCaptchaProps> = ({ onSuccess, onFail }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [circles, setCircles] = useState<{ x: number; y: number; r: number; correctAngle: number }[]>([]);
  const [solved, setSolved] = useState(false);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    // Generate random circles with a gap
    const newCircles = Array.from({ length: 3 }, () => {
      const r = 40 + Math.random() * 20;
      const correctAngle = Math.random() * 360;
      return {
        x: 80 + Math.random() * 240,
        y: 80 + Math.random() * 140,
        r,
        correctAngle,
      };
    });
    setCircles(newCircles);
    drawCaptcha(newCircles);
  }, []);

  const drawCaptcha = (circlesData: typeof circles) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    circlesData.forEach((circle) => {
      ctx.save();
      ctx.translate(circle.x, circle.y);

      // Draw a circle with a rotating gap
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const gapStart = (circle.correctAngle * Math.PI) / 180;
      const gapEnd = ((circle.correctAngle + 60) * Math.PI) / 180;
      ctx.arc(0, 0, circle.r, gapEnd, gapStart);
      ctx.stroke();

      // Draw smaller circles around (decoration)
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120 * Math.PI) / 180;
        const dx = Math.cos(angle) * (circle.r + 20);
        const dy = Math.sin(angle) * (circle.r + 20);
        ctx.beginPath();
        ctx.arc(dx, dy, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      ctx.restore();
    });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (solved) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if click is near a circle's gap (simple heuristic)
    let allMatched = true;
    for (const circle of circles) {
      const dx = x - circle.x;
      const dy = y - circle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < circle.r + 30 && dist > circle.r - 30) {
        const clickAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        const normAngle = (clickAngle + 360) % 360;
        const diff = Math.abs(normAngle - circle.correctAngle);
        if (diff > 40 && diff < 320) {
          allMatched = false;
          break;
        }
      }
    }

    if (allMatched) {
      setSolved(true);
      onSuccess();
    } else {
      setFailCount(failCount + 1);
      if (failCount + 1 >= 3) {
        onFail();
      } else {
        // Regenerate
        const newCircles = Array.from({ length: 3 }, () => {
          const r = 40 + Math.random() * 20;
          const correctAngle = Math.random() * 360;
          return {
            x: 80 + Math.random() * 240,
            y: 80 + Math.random() * 140,
            r,
            correctAngle,
          };
        });
        setCircles(newCircles);
        drawCaptcha(newCircles);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-foreground">
        {solved
          ? 'Captcha bestanden! ✅'
          : 'Klicke auf die Lücken in den Kreisen, um fortzufahren'}
      </p>
      <canvas
        ref={canvasRef}
        width={400}
        height={300}
        onClick={handleCanvasClick}
        className="border border-border rounded-lg cursor-pointer"
      />
      {failCount > 0 && !solved && (
        <p className="text-xs text-destructive">
          Fehlversuche: {failCount}/3
        </p>
      )}
    </div>
  );
};
