import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function VoiceAssistant({ onTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';

        rec.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          onTranscript(transcript);
          setIsListening(false);
          toast.success(`Heard: "${transcript}"`);
        };

        rec.onerror = (event) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
          if (event.error !== 'no-speech') {
            toast.error(`Voice error: ${event.error}`);
          }
        };

        rec.onend = () => {
          setIsListening(false);
        };

        setRecognition(rec);
      } else {
        console.warn("SpeechRecognition API not supported in this browser.");
      }
    }
  }, [onTranscript]);

  const toggleListen = () => {
    if (!recognition) {
      toast.error("Speech recognition is not supported in your browser.");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
        toast.info("Listening...");
      } catch (err) {
        // Handle case where it might already be started
        setIsListening(false);
      }
    }
  };

  if (!recognition) return null;

  return (
    <Button 
      variant={isListening ? "destructive" : "secondary"} 
      onClick={toggleListen}
      className="flex items-center gap-2 rounded-full px-4 shadow-md"
    >
      {isListening ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Listening...
        </>
      ) : (
        <>
          <Mic className="w-4 h-4" />
          Voice Command
        </>
      )}
    </Button>
  );
}
