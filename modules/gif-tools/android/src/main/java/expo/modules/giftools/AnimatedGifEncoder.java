package expo.modules.giftools;

import java.io.IOException;
import java.io.OutputStream;
import android.graphics.Bitmap;
import android.graphics.Color;

public class AnimatedGifEncoder {
  protected int width;
  protected int height;
  protected int repeat = -1;
  protected int delay = 0;
  protected boolean started = false;
  protected OutputStream out;
  protected Bitmap image;
  protected byte[] pixels;
  protected byte[] indexedPixels;
  protected int colorDepth;
  protected byte[] colorTab;
  protected boolean[] usedEntry = new boolean[256];
  protected int palSize = 7;
  protected int dispose = -1;
  protected boolean closeStream = false;
  protected boolean firstFrame = true;
  protected boolean sizeSet = false;
  protected int sample = 10;

  public void setDelay(int ms) {
    delay = Math.round(ms / 10.0f);
  }

  public void setDispose(int code) {
    if (code >= 0) dispose = code;
  }

  public void setRepeat(int iter) {
    if (iter >= 0) repeat = iter;
  }

  public void setFrameRate(float fps) {
    if (fps != 0f) delay = Math.round(100f / fps);
  }

  public void setQuality(int quality) {
    if (quality < 1) quality = 1;
    sample = quality;
  }

  public void setSize(int w, int h) {
    if (started && !firstFrame) return;
    width = w;
    height = h;
    if (width < 1) width = 320;
    if (height < 1) height = 240;
    sizeSet = true;
  }

  public boolean start(OutputStream os) {
    if (os == null) return false;
    boolean ok = true;
    closeStream = false;
    out = os;
    try {
      writeString("GIF89a");
    } catch (IOException e) {
      ok = false;
    }
    return started = ok;
  }

  public boolean addFrame(Bitmap im) {
    if ((im == null) || !started) return false;
    boolean ok = true;
    try {
      if (!sizeSet) setSize(im.getWidth(), im.getHeight());
      image = im;
      getImagePixels();
      analyzePixels();
      if (firstFrame) {
        writeLSD();
        writePalette();
        if (repeat >= 0) writeNetscapeExt();
      }
      writeGraphicCtrlExt();
      writeImageDesc();
      if (!firstFrame) writePalette();
      writePixels();
      firstFrame = false;
    } catch (IOException e) {
      ok = false;
    }
    return ok;
  }

  public boolean finish() {
    if (!started) return false;
    boolean ok = true;
    started = false;
    try {
      out.write(0x3b);
      out.flush();
      if (closeStream) out.close();
    } catch (IOException e) {
      ok = false;
    }
    return ok;
  }

  protected void analyzePixels() {
    int len = pixels.length;
    int nPix = len / 3;
    indexedPixels = new byte[nPix];
    NeuQuant nq = new NeuQuant(pixels, len, sample);
    colorTab = nq.process();
    for (int i = 0; i < colorTab.length; i += 3) {
      byte temp = colorTab[i];
      colorTab[i] = colorTab[i + 2];
      colorTab[i + 2] = temp;
      usedEntry[i / 3] = false;
    }
    int k = 0;
    for (int i = 0; i < nPix; i++) {
      int index = nq.map(pixels[k++] & 0xff, pixels[k++] & 0xff, pixels[k++] & 0xff);
      usedEntry[index] = true;
      indexedPixels[i] = (byte) index;
    }
    pixels = null;
    colorDepth = 8;
    palSize = 7;
  }

  protected void getImagePixels() {
    int w = image.getWidth();
    int h = image.getHeight();
    if ((w != width) || (h != height)) {
      Bitmap temp = Bitmap.createScaledBitmap(image, width, height, true);
      image = temp;
    }
    int[] pixelsInt = new int[width * height];
    image.getPixels(pixelsInt, 0, width, 0, 0, width, height);
    pixels = new byte[pixelsInt.length * 3];
    for (int i = 0; i < pixelsInt.length; i++) {
      int pixel = pixelsInt[i];
      pixels[i * 3] = (byte) ((pixel >> 16) & 0xff);
      pixels[i * 3 + 1] = (byte) ((pixel >> 8) & 0xff);
      pixels[i * 3 + 2] = (byte) (pixel & 0xff);
    }
  }

  protected void writeGraphicCtrlExt() throws IOException {
    out.write(0x21);
    out.write(0xf9);
    out.write(4);
    int transp = 0;
    int disp = 0;
    if (dispose >= 0) disp = dispose & 7;
    disp <<= 2;
    out.write(disp | transp);
    writeShort(delay);
    out.write(0);
    out.write(0);
  }

  protected void writeImageDesc() throws IOException {
    out.write(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    if (firstFrame) {
      out.write(0);
    } else {
      out.write(0x80 | palSize);
    }
  }

  protected void writeLSD() throws IOException {
    writeShort(width);
    writeShort(height);
    out.write((0x80 | 0x70 | 0x00 | palSize));
    out.write(0);
    out.write(0);
  }

  protected void writeNetscapeExt() throws IOException {
    out.write(0x21);
    out.write(0xff);
    out.write(11);
    writeString("NETSCAPE2.0");
    out.write(3);
    out.write(1);
    writeShort(repeat);
    out.write(0);
  }

  protected void writePalette() throws IOException {
    out.write(colorTab, 0, colorTab.length);
    int n = (3 * 256) - colorTab.length;
    for (int i = 0; i < n; i++) {
      out.write(0);
    }
  }

  protected void writePixels() throws IOException {
    LZWEncoder encoder = new LZWEncoder(width, height, indexedPixels, colorDepth);
    encoder.encode(out);
  }

  protected void writeShort(int value) throws IOException {
    out.write(value & 0xff);
    out.write((value >> 8) & 0xff);
  }

  protected void writeString(String s) throws IOException {
    for (int i = 0; i < s.length(); i++) {
      out.write((byte) s.charAt(i));
    }
  }
}
