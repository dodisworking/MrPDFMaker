require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const puppeteer = require('puppeteer');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads and outputs directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');

[uploadsDir, outputsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Session and cookie middleware
app.use(cookieParser());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Store pending conversions (filename -> sessionId)
// Note: Usage tracking is now handled client-side via localStorage
const pendingConversions = new Map();

// Serve static files
app.use(express.static('public'));

// Convert image to PDF
async function imageToPdf(imagePath, outputPath) {
  try {
    const pdfDoc = await PDFDocument.create();
    const image = await sharp(imagePath).toBuffer();
    const imageType = path.extname(imagePath).toLowerCase();
    
    let pdfImage;
    if (imageType === '.jpg' || imageType === '.jpeg') {
      pdfImage = await pdfDoc.embedJpg(image);
    } else if (imageType === '.png') {
      pdfImage = await pdfDoc.embedPng(image);
    } else {
      // Convert other formats to PNG first
      const pngBuffer = await sharp(imagePath).png().toBuffer();
      pdfImage = await pdfDoc.embedPng(pngBuffer);
    }
    
    const page = pdfDoc.addPage();
    const { width, height } = pdfImage.scale(1);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    
    // Scale image to fit page while maintaining aspect ratio
    const scale = Math.min(pageWidth / width, pageHeight / height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const x = (pageWidth - scaledWidth) / 2;
    const y = (pageHeight - scaledHeight) / 2;
    
    page.drawImage(pdfImage, {
      x: x,
      y: y,
      width: scaledWidth,
      height: scaledHeight,
    });
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return true;
  } catch (error) {
    console.error('Error converting image to PDF:', error);
    throw error;
  }
}

// Convert HTML to PDF using Puppeteer
async function htmlToPdf(htmlPath, outputPath) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true
    });
    
    await browser.close();
    return true;
  } catch (error) {
    console.error('Error converting HTML to PDF:', error);
    throw error;
  }
}

// Convert text file to PDF
async function textToPdf(textPath, outputPath) {
  try {
    const textContent = fs.readFileSync(textPath, 'utf8');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    
    // Simple text rendering (you might want to use a more sophisticated library)
    const fontSize = 12;
    const margin = 50;
    const maxWidth = width - 2 * margin;
    const maxHeight = height - 2 * margin;
    
    const lines = textContent.split('\n');
    let y = height - margin;
    
    for (const line of lines) {
      if (y < margin) {
        const newPage = pdfDoc.addPage();
        y = height - margin;
      }
      
      // Simple word wrapping (basic implementation)
      const words = line.split(' ');
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        if (testLine.length * 6 > maxWidth) {
          if (currentLine) {
            page.drawText(currentLine, {
              x: margin,
              y: y,
              size: fontSize,
            });
            y -= fontSize + 5;
            currentLine = word;
          }
        } else {
          currentLine = testLine;
        }
      }
      
      if (currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: y,
          size: fontSize,
        });
        y -= fontSize + 5;
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return true;
  } catch (error) {
    console.error('Error converting text to PDF:', error);
    throw error;
  }
}

// Upload and convert endpoint
app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check if client indicates they've paid (from localStorage)
  // If they haven't paid and need payment, client will send requiresPayment header
  if (req.headers['x-requires-payment'] === 'true') {
    // Store the file info for later conversion after payment
    const sessionId = req.sessionID;
    pendingConversions.set(sessionId, {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path
    });
    return res.status(402).json({ 
      error: 'Payment required',
      requiresPayment: true,
      filename: req.file.filename
    });
  }

  const inputPath = req.file.path;
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const outputFilename = path.basename(req.file.filename, fileExt) + '.pdf';
  const outputPath = path.join(outputsDir, outputFilename);

  try {
    // Determine file type and convert accordingly
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(fileExt)) {
      await imageToPdf(inputPath, outputPath);
    } else if (['.html', '.htm'].includes(fileExt)) {
      await htmlToPdf(inputPath, outputPath);
    } else if (['.txt', '.md'].includes(fileExt)) {
      await textToPdf(inputPath, outputPath);
    } else if (fileExt === '.pdf') {
      // If already PDF, just copy it
      fs.copyFileSync(inputPath, outputPath);
    } else {
      // Try to treat as image
      try {
        await imageToPdf(inputPath, outputPath);
      } catch (err) {
        return res.status(400).json({ 
          error: `Unsupported file type: ${fileExt}. Supported types: images (jpg, png, gif, bmp, webp), HTML, text files, and PDFs.` 
        });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(inputPath);

    // Send download link
    res.json({ 
      success: true, 
      filename: outputFilename,
      downloadUrl: `/download/${outputFilename}`
    });
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Failed to convert file to PDF: ' + error.message });
  }
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(outputsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    } else {
      // Optionally delete file after download
      // fs.unlinkSync(filePath);
    }
  });
});

// Usage tracking is now handled client-side via localStorage
// No server-side usage endpoint needed

// Get Stripe publishable key
app.get('/api/stripe-key', (req, res) => {
  res.json({ 
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here' 
  });
});

// Create Payment Intent for embedded payment
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 100, // $1.00 in cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        session_id: req.sessionID
      }
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret 
    });
  } catch (error) {
    console.error('Payment Intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Stripe Checkout Session using your Price ID
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID || 'price_1Se7DTR8FdUOhyE78MzXW1aZ',
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin || 'http://localhost:3000'}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/?payment=cancelled`,
      metadata: {
        session_id: req.sessionID
      }
    });

    res.json({ sessionId: checkoutSession.id, url: checkoutSession.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify payment status and complete conversion
app.post('/api/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  
  try {
    let paymentStatus = 'unpaid';
    let originalSessionId = req.sessionID;
    
    // Check if it's a Payment Intent ID or Checkout Session ID
    if (sessionId && sessionId.startsWith('pi_')) {
      // Payment Intent
      const paymentIntent = await stripe.paymentIntents.retrieve(sessionId);
      paymentStatus = paymentIntent.status;
      originalSessionId = paymentIntent.metadata?.session_id || req.sessionID;
    } else if (sessionId) {
      // Checkout Session
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      paymentStatus = checkoutSession.payment_status;
      originalSessionId = checkoutSession.metadata?.session_id || req.sessionID;
    }
    
    if (paymentStatus === 'succeeded' || paymentStatus === 'paid') {
      // Payment verified - client will mark as paid in localStorage
      
      // Complete the pending conversion using the original session ID
      const pending = pendingConversions.get(originalSessionId);
      
      if (pending) {
        // Complete the conversion
        const inputPath = pending.path;
        const fileExt = path.extname(pending.originalname).toLowerCase();
        const outputFilename = path.basename(pending.filename, path.extname(pending.filename)) + '.pdf';
        const outputPath = path.join(outputsDir, outputFilename);

        try {
          // Determine file type and convert accordingly
          if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(fileExt)) {
            await imageToPdf(inputPath, outputPath);
          } else if (['.html', '.htm'].includes(fileExt)) {
            await htmlToPdf(inputPath, outputPath);
          } else if (['.txt', '.md'].includes(fileExt)) {
            await textToPdf(inputPath, outputPath);
          } else if (fileExt === '.pdf') {
            fs.copyFileSync(inputPath, outputPath);
          } else {
            try {
              await imageToPdf(inputPath, outputPath);
            } catch (err) {
              throw new Error(`Unsupported file type: ${fileExt}`);
            }
          }

          // Clean up uploaded file
          fs.unlinkSync(inputPath);
          
          // Remove from pending
          pendingConversions.delete(originalSessionId);

          res.json({ 
            success: true, 
            paid: true,
            filename: outputFilename,
            downloadUrl: `/download/${outputFilename}`
          });
        } catch (error) {
          // Clean up on error
          if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
          }
          console.error('Conversion error:', error);
          res.status(500).json({ error: 'Failed to convert file: ' + error.message });
        }
      } else {
        res.json({ success: true, paid: true });
      }
    } else {
      res.json({ success: false, paid: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

