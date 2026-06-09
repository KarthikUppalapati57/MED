import re

path = r'c:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\code\src\pages\LandingPage.jsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Framer motion hooks
text = text.replace('"rgba(5, 5, 8, 0)"', '"transparent"')
text = text.replace('"rgba(5, 5, 8, 0.85)"', '"hsl(var(--background) / 0.85)"')
text = text.replace('"rgba(255, 255, 255, 0)"', '"transparent"')
text = text.replace('"rgba(255, 255, 255, 0.05)"', '"hsl(var(--border) / 0.8)"')

# Class replacements
text = text.replace('text-white/60', 'text-muted-foreground')
text = text.replace('text-white/80', 'text-muted-foreground')
text = text.replace('text-white/40', 'text-muted-foreground/60')
text = text.replace('text-white', 'text-foreground')
text = text.replace('bg-white/5', 'bg-foreground/5')
text = text.replace('bg-white/10', 'bg-foreground/10')
text = text.replace('bg-white/20', 'bg-foreground/20')
text = text.replace('bg-white', 'bg-foreground')
text = text.replace('text-black', 'text-background')
text = text.replace('border-white/10', 'border-border')
text = text.replace('border-white/20', 'border-border')
text = text.replace('border-white/5', 'border-border')
text = text.replace('bg-[#050508]', 'bg-background')
text = text.replace('bg-[#ff5c35]', 'bg-brand')
text = text.replace('text-[#ff5c35]', 'text-brand')
text = text.replace('border-[#ff5c35]', 'border-brand')
text = text.replace('border-[#ff5c35]/20', 'border-brand/20')
text = text.replace('border-[#ff5c35]/50', 'border-brand/50')
text = text.replace('bg-[#ff5c35]/10', 'bg-brand/10')
text = text.replace('bg-[#ff5c35]/30', 'bg-brand/30')
text = text.replace('rgba(255,255,255,0.02)', 'hsl(var(--card))')
text = text.replace('rgba(255,255,255,0.05)', 'hsl(var(--border))')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')
