import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const StarBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        // Interaction State
        const target = { x: 0, y: 0 };
        const current = { x: 0, y: 0 };
        const ease = 0.05;

        // Dark Mode Assets
        const stars: { x: number; y: number; z: number; radius: number; alpha: number }[] = [];
        const comets: { x: number; y: number; length: number; speed: number; angle: number; opacity: number }[] = [];

        // Light Mode Assets (Sun Ray / Particles)
        const rays: { angle: number; speed: number; length: number }[] = [];

        const initDark = () => {
            stars.length = 0;
            const starCount = Math.floor(w * h * 0.00015);
            for (let i = 0; i < starCount; i++) {
                stars.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    z: Math.random() * 2 + 0.5,
                    radius: Math.random() * 1.2 + 0.1,
                    alpha: Math.random() * 0.8 + 0.2,
                });
            }
        };

        const initLight = () => {
            rays.length = 0;
            for (let i = 0; i < 20; i++) {
                rays.push({
                    angle: (i / 20) * Math.PI * 2,
                    speed: 0.002 + Math.random() * 0.002,
                    length: Math.random() * 0.5 + 0.5
                })
            }
        };

        const spawnComet = () => {
            if (theme !== 'dark') return;
            if (Math.random() > 0.985 && comets.length < 3) {
                comets.push({
                    x: Math.random() * w,
                    y: Math.random() * (h * 0.4),
                    length: Math.random() * 80 + 50,
                    speed: Math.random() * 5 + 3,
                    angle: Math.PI / 4 + (Math.random() * 0.2 - 0.1),
                    opacity: 1
                });
            }
        };

        const handleInput = (x: number, y: number) => {
            target.x = (x - w / 2) * 0.05;
            target.y = (y - h / 2) * 0.05;
        };

        const onMouseMove = (e: MouseEvent) => handleInput(e.clientX, e.clientY);
        const onTouchMove = (e: TouchEvent) => handleInput(e.touches[0].clientX, e.touches[0].clientY);

        const drawDark = () => {
            ctx.fillStyle = '#080808';
            ctx.fillRect(0, 0, w, h);

            // 1. Draw Stars First (Background)
            ctx.fillStyle = '#FFFFFF';
            stars.forEach(star => {
                const parallaxX = -current.x * star.z * 5;
                const parallaxY = -current.y * star.z * 5;
                const drawX = (star.x + parallaxX % w + w) % w;
                const drawY = (star.y + parallaxY % h + h) % h;

                ctx.globalAlpha = star.alpha;
                ctx.beginPath();
                ctx.arc(drawX, drawY, star.radius, 0, Math.PI * 2);
                ctx.fill();

                if (Math.random() > 0.99) {
                    star.alpha += (Math.random() - 0.5) * 0.2;
                    if (star.alpha < 0.1) star.alpha = 0.1;
                    if (star.alpha > 0.9) star.alpha = 0.9;
                }
            });
            ctx.globalAlpha = 1;

            // 2. Draw Realistic Full Moon
            const baseX = w * 0.85;
            const baseY = h * 0.15;
            const moonX = baseX + (-current.x * 0.8);
            const moonY = baseY + (-current.y * 0.8);
            const moonRadius = 40;

            // A. Atmospheric Glow (Behind)
            const moonGlow = ctx.createRadialGradient(moonX, moonY, moonRadius, moonX, moonY, moonRadius * 4);
            moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
            moonGlow.addColorStop(0.5, 'rgba(200, 220, 255, 0.05)');
            moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = moonGlow;
            ctx.beginPath();
            ctx.arc(moonX, moonY, moonRadius * 4, 0, Math.PI * 2);
            ctx.fill();

            // B. Moon Sphere (Lit)
            ctx.beginPath();
            ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);

            // 3D Spherical Gradient
            const moonGrad = ctx.createRadialGradient(moonX - 12, moonY - 12, 4, moonX, moonY, moonRadius);
            moonGrad.addColorStop(0, '#FFFFFF');     // Highlight
            moonGrad.addColorStop(0.3, '#E0E0E0');  // Midtone
            moonGrad.addColorStop(1, '#909090');     // Shadow side
            ctx.fillStyle = moonGrad;
            ctx.fill();

            // C. Craters (Subtle details)
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            [
                { x: 10, y: -5, r: 8 }, { x: -15, y: 10, r: 6 }, { x: 5, y: 20, r: 5 },
                { x: -8, y: -15, r: 7 }, { x: 20, y: 5, r: 4 },
                { x: 15, y: 15, r: 3 }, { x: -20, y: -5, r: 5 }
            ].forEach(c => {
                ctx.beginPath();
                ctx.arc(moonX + c.x, moonY + c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
            });

            spawnComet();
            for (let i = comets.length - 1; i >= 0; i--) {
                const comet = comets[i];
                comet.x += Math.cos(comet.angle) * comet.speed;
                comet.y += Math.sin(comet.angle) * comet.speed;

                const cX = comet.x + (-current.x * 2);
                const cY = comet.y + (-current.y * 2);

                const gradient = ctx.createLinearGradient(
                    cX, cY,
                    cX - Math.cos(comet.angle) * comet.length,
                    cY - Math.sin(comet.angle) * comet.length
                );
                gradient.addColorStop(0, `rgba(255, 255, 255, ${comet.opacity})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.strokeStyle = gradient;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cX, cY);
                ctx.lineTo(
                    cX - Math.cos(comet.angle) * comet.length,
                    cY - Math.sin(comet.angle) * comet.length
                );
                ctx.stroke();

                if (comet.x > w + 200 || comet.y > h + 200) comets.splice(i, 1);
            }
        };

        const drawLight = () => {
            // Pure White Background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);

            // Sun Calculation
            // Place sun relative to mouse but inverted (parallax)
            // base position: top right-ish
            const baseX = w * 0.8;
            const baseY = h * 0.2;

            const sunX = baseX + (-current.x * 2);
            const sunY = baseY + (-current.y * 2);

            // Draw Sun Glow
            const gradient = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 600);
            gradient.addColorStop(0, 'rgba(255, 200, 100, 0.4)'); // Warm center
            gradient.addColorStop(0.2, 'rgba(255, 220, 150, 0.1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);

            // Draw Sun Core
            ctx.beginPath();
            ctx.arc(sunX, sunY, 60, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 180, 50, 0.15)'; // Very subtle core
            ctx.fill();

            // Draw Rays
            rays.forEach(ray => {
                ray.angle += ray.speed;
                const rayLen = 800 * ray.length;
                const endX = sunX + Math.cos(ray.angle) * rayLen;
                const endY = sunY + Math.sin(ray.angle) * rayLen;

                const rayGrad = ctx.createLinearGradient(sunX, sunY, endX, endY);
                rayGrad.addColorStop(0, 'rgba(255, 200, 100, 0.05)');
                rayGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.strokeStyle = rayGrad;
                ctx.lineWidth = 40;
                ctx.beginPath();
                ctx.moveTo(sunX, sunY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            });

        };

        const draw = () => {
            current.x += (target.x - current.x) * ease;
            current.y += (target.y - current.y) * ease;

            if (theme === 'dark') {
                drawDark();
            } else {
                drawLight();
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        const handleResize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
            if (theme === 'dark') initDark();
            else initLight();
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove);

        // Initial setup based on current theme
        if (theme === 'dark') initDark();
        else initLight();

        draw();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchmove', onTouchMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [theme]); // Re-run effect when theme changes to switch assets completely

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-[-1] pointer-events-none transition-opacity duration-1000"
            style={{
                background: theme === 'dark' ? '#000000' : '#FFFFFF',
            }}
        />
    );
};

export default StarBackground;
