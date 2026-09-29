import { motion } from 'framer-motion';
import MarkdownRenderer from './MarkdownRenderer';

interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
}

export default function StreamingText({ text, isStreaming }: StreamingTextProps) {
  return (
    <div>
      <MarkdownRenderer content={text} />
      {isStreaming && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
          className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 align-text-bottom rounded-sm"
        />
      )}
    </div>
  );
}
