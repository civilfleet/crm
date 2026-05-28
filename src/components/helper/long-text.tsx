import { Clipboard } from "lucide-react";
import { useState } from "react";

function LongText({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
  };

  return (
    <div className="space-y-2 relative p-2 ">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-gray-100"
      >
        <Clipboard className="w-5 h-5 text-gray-700" />
      </button>
      <p className="whitespace-pre-wrap">{content}</p>
      {copied && <span className="text-green-500 text-sm">Copied!</span>}
    </div>
  );
}

export default LongText;
