"use client";

import { motion } from "motion/react";

interface ShiningTextProps {
  text: string;
}

export function ShiningText({ text }: ShiningTextProps) {
  return (
    <motion.span
      className="bg-[linear-gradient(110deg,#6b3f5e,35%,#e8a0bf,50%,#6b3f5e,75%,#6b3f5e)] bg-[length:200%_100%] bg-clip-text text-sm font-light text-transparent"
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: "linear",
      }}
    >
      {text}
    </motion.span>
  );
}
