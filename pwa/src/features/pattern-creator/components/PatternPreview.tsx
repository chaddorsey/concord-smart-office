/**
 * Pattern Preview Component
 *
 * Canvas-based preview that renders theta-rho points with support for
 * animated playback showing the ball path.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ThetaRhoPoint } from '../types';
import { thetaRhoToCartesian } from '../services/patternGenerator';

export interface PatternPreviewProps {
  /** Array of theta-rho points to render */
  points: ThetaRhoPoint[];
  /** Size of the canvas in pixels (width and height) */
  size?: number;
  /** Whether to animate the drawing of the pattern */
  isAnimating?: boolean;
  /** Animation progress (0-1), controlled externally if provided */
  animationProgress?: number;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Animation speed multiplier (1 = normal) */
  playbackSpeed?: number;
  /** Show the circular boundary */
  showBoundary?: boolean;
  /** Line color for the pattern */
  lineColor?: string;
  /** Line width for the pattern */
  lineWidth?: number;
  /** Background color */
  backgroundColor?: string;
  /** Boundary color */
  boundaryColor?: string;
  /** Show the "ball" at current position during animation */
  showBall?: boolean;
  /** Ball color */
  ballColor?: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * PatternPreview renders a theta-rho pattern on a canvas with optional animation
 */
export const PatternPreview: React.FC<PatternPreviewProps> = ({
  points,
  size = 300,
  isAnimating = false,
  animationProgress: externalProgress,
  onAnimationComplete,
  playbackSpeed = 1,
  showBoundary = true,
  lineColor = '#3b82f6',
  lineWidth = 1.5,
  backgroundColor = '#1f2937',
  boundaryColor = '#374151',
  showBall = true,
  ballColor = '#f59e0b',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [internalProgress, setInternalProgress] = useState(0);

  // Use external progress if provided, otherwise use internal
  const progress = externalProgress !== undefined ? externalProgress : internalProgress;

  // Calculate canvas coordinates from theta-rho
  const getCanvasCoords = useCallback(
    (theta: number, rho: number): { x: number; y: number } => {
      const margin = 20;
      const radius = (size - margin * 2) / 2;
      const center = size / 2;

      const cart = thetaRhoToCartesian(theta, rho, radius);
      return {
        x: center + cart.x,
        y: center - cart.y, // Flip Y for canvas coordinates
      };
    },
    [size]
  );

  // Render the pattern to canvas
  const renderPattern = useCallback(
    (ctx: CanvasRenderingContext2D, drawProgress: number = 1) => {
      const center = size / 2;
      const margin = 20;
      const radius = (size - margin * 2) / 2;

      // Clear canvas
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, size, size);

      // Draw boundary circle
      if (showBoundary) {
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.strokeStyle = boundaryColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw center dot
        ctx.beginPath();
        ctx.arc(center, center, 2, 0, Math.PI * 2);
        ctx.fillStyle = boundaryColor;
        ctx.fill();
      }

      if (points.length === 0) return;

      // Calculate how many points to draw based on progress
      const pointsToDraw = Math.floor(points.length * drawProgress);
      if (pointsToDraw < 2) return;

      // Draw the pattern path
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const firstCoords = getCanvasCoords(points[0].theta, points[0].rho);
      ctx.moveTo(firstCoords.x, firstCoords.y);

      for (let i = 1; i < pointsToDraw; i++) {
        const coords = getCanvasCoords(points[i].theta, points[i].rho);
        ctx.lineTo(coords.x, coords.y);
      }

      ctx.stroke();

      // Draw the ball at current position during animation
      if (showBall && drawProgress < 1 && pointsToDraw > 0) {
        const currentPoint = points[pointsToDraw - 1];
        const ballCoords = getCanvasCoords(currentPoint.theta, currentPoint.rho);

        ctx.beginPath();
        ctx.arc(ballCoords.x, ballCoords.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = ballColor;
        ctx.fill();

        // Add glow effect
        ctx.beginPath();
        ctx.arc(ballCoords.x, ballCoords.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = ballColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
    [
      points,
      size,
      showBoundary,
      backgroundColor,
      boundaryColor,
      lineColor,
      lineWidth,
      showBall,
      ballColor,
      getCanvasCoords,
    ]
  );

  // Animation loop
  useEffect(() => {
    if (!isAnimating || points.length === 0) {
      // If not animating, draw the full pattern
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderPattern(ctx, 1);
      return;
    }

    // Start animation
    let startTime: number | null = null;
    const duration = (points.length / 100) * (1000 / playbackSpeed); // Adjust based on point count

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const newProgress = Math.min(elapsed / duration, 1);

      setInternalProgress(newProgress);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderPattern(ctx, newProgress);

      if (newProgress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        onAnimationComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAnimating, points, playbackSpeed, renderPattern, onAnimationComplete]);

  // Re-render when external progress changes
  useEffect(() => {
    if (externalProgress !== undefined && !isAnimating) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderPattern(ctx, externalProgress);
    }
  }, [externalProgress, isAnimating, renderPattern]);

  // Initial render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!isAnimating) {
      renderPattern(ctx, 1);
    }
  }, [points, isAnimating, renderPattern]);

  // Handle high DPI displays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      renderPattern(ctx, isAnimating ? progress : 1);
    }
  }, [size, isAnimating, progress, renderPattern]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`pattern-preview ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'block',
      }}
    />
  );
};

/**
 * Hook for controlling pattern preview animation
 */
export function usePatternAnimation(_points: ThetaRhoPoint[]) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const play = useCallback(() => {
    setIsPlaying(true);
    setProgress(0);
    startTimeRef.current = null;
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    startTimeRef.current = null;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      if (progress >= 1) {
        setProgress(0);
      }
      play();
    }
  }, [isPlaying, progress, play, pause]);

  return {
    isPlaying,
    progress,
    play,
    pause,
    reset,
    togglePlayPause,
    setProgress,
  };
}

export default PatternPreview;
