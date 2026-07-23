document.addEventListener('DOMContentLoaded', () => {
  function makeDraggable(el, handle) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const dragHandle = handle || el;
    dragHandle.style.cursor = 'grab';

    dragHandle.addEventListener('mousedown', (e) => {
      if (['INPUT', 'BUTTON', 'TEXTAREA', 'svg', 'path'].includes(e.target.tagName)) return;
      if (e.target.closest('button')) return; // ignore clicks on buttons inside header
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const style = window.getComputedStyle(el);
      initialLeft = parseFloat(style.left) || el.getBoundingClientRect().left;
      initialTop = parseFloat(style.top) || el.getBoundingClientRect().top;
      
      // Convert from % to px if it wasn't already to prevent jumping
      el.style.left = `${initialLeft}px`;
      el.style.top = `${initialTop}px`;
      
      dragHandle.style.cursor = 'grabbing';
      
      // Bring to front
      document.querySelectorAll('.popup-panel, .widget').forEach(p => p.style.zIndex = '1');
      el.style.zIndex = '100';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      el.style.left = `${initialLeft + dx}px`;
      el.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        dragHandle.style.cursor = 'grab';
      }
    });
  }

  // Initialize dragging
  setTimeout(() => {
    const widget = document.getElementById('jarvis-widget');
    if (widget) makeDraggable(widget);

    const chatPopup = document.getElementById('chat-popup');
    if (chatPopup) makeDraggable(chatPopup, chatPopup.querySelector('.popup-header'));

    const visionPopup = document.getElementById('vision-popup');
    if (visionPopup) makeDraggable(visionPopup, visionPopup.querySelector('.popup-header'));
  }, 500); // slight delay to ensure DOM is ready
});
