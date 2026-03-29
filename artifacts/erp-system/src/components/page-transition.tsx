import { useRef, useLayoutEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import gsap from "gsap";

interface PageTransitionProps { children: ReactNode; }

export function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();
  const el = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!el.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power2.out" }
      );
    }, el);
    return () => ctx.revert();
  }, [location]);

  return (
    <div ref={el} className="page-wrapper">
      {children}
    </div>
  );
}
