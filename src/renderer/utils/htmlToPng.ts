import html2canvas from 'html2canvas';

const RENDER_WIDTH_PX = 1280;

/**
 * Renders a full HTML document string to a PNG data URL via an off-screen iframe.
 */
export async function htmlDocumentToPngDataUrl(html: string, scale = 2): Promise<string> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${RENDER_WIDTH_PX}px`;
  iframe.style.height = '900px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  try {
    iframe.srcdoc = html;
    await waitForIframeRender(iframe);

    const doc = iframe.contentDocument;
    if (!doc?.body) {
      throw new Error('Could not render HTML for image export');
    }

    const target = doc.body.querySelector('.container') ?? doc.body;
    const canvas = await html2canvas(target as HTMLElement, {
      backgroundColor: null,
      scale,
      useCORS: true,
      logging: false,
      windowWidth: RENDER_WIDTH_PX,
    });

    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(iframe);
  }
}

function waitForIframeRender(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 150);
      });
    };
    iframe.addEventListener('load', finish, { once: true });
    setTimeout(finish, 500);
  });
}
