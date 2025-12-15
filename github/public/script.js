const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultContainer = document.getElementById('resultContainer');
const errorContainer = document.getElementById('errorContainer');
const downloadLink = document.getElementById('downloadLink');
const errorMessage = document.getElementById('errorMessage');

let stripe;
let elements;
let paymentElement;

// API base URL - set this to your backend server URL when deploying
// For localhost, leave empty to use relative URLs
// Example: window.API_BASE_URL = 'https://your-backend.herokuapp.com';
const API_BASE_URL = window.API_BASE_URL || '';

// Track free conversions in localStorage (resets on browser clear)
// Allows 3 free conversions before paywall
function getFreeConversions() {
  const stored = localStorage.getItem('mrpdf_free_conversions');
  return stored ? parseInt(stored, 10) : 0;
}

function incrementFreeConversions() {
  const current = getFreeConversions();
  localStorage.setItem('mrpdf_free_conversions', (current + 1).toString());
}

function canConvertFree() {
  // Check if user has paid (infinite conversions)
  if (hasPaid()) {
    return true;
  }
  // Allow 3 free conversions
  return getFreeConversions() < 3;
}

// Check if user has paid (using localStorage)
function hasPaid() {
  return localStorage.getItem('mrpdf_paid') === 'true';
}

// Mark user as paid
function markAsPaid() {
  localStorage.setItem('mrpdf_paid', 'true');
  // Also set a timestamp for reference
  localStorage.setItem('mrpdf_paid_date', new Date().toISOString());
  // Clear free conversion count since they have unlimited now
  localStorage.removeItem('mrpdf_free_conversions');
}

// Show paywall during upload
function showPaywall() {
  // Hide header and footer when showing paywall
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  if (header) header.style.display = 'none';
  if (footer) footer.style.display = 'none';
  
  progressContainer.style.display = 'none';
  uploadArea.style.display = 'flex';
  uploadArea.style.justifyContent = 'center';
  uploadArea.style.alignItems = 'center';
  uploadArea.innerHTML = `
    <div class="paywall-content">
      <h2>💰 Payment Required</h2>
      <p>Your file is ready to convert!</p>
      <p class="price">Pay $1.00 to get infinite conversions</p>
      <button id="payButton" class="pay-btn">Pay $1.00</button>
      <p class="paywall-note">Secure payment powered by Stripe</p>
    </div>
  `;
  
  const payButton = document.getElementById('payButton');
  if (payButton) {
    payButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlePayment();
    });
  }
}

// Initialize Stripe
async function initializeStripe() {
  if (stripe) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/stripe-key`);
    const { publishableKey } = await response.json();
    stripe = Stripe(publishableKey);
  } catch (error) {
    console.error('Error initializing Stripe:', error);
    showError('Failed to initialize payment. Please refresh the page.');
  }
}

// Show payment modal
function showPaymentModal() {
  const modal = document.getElementById('paymentModal');
  modal.style.display = 'flex';
  initializePaymentForm();
}

// Close payment modal
function closePaymentModal() {
  const modal = document.getElementById('paymentModal');
  modal.style.display = 'none';
  
  // Clean up payment element if it exists
  if (paymentElement) {
    paymentElement.unmount();
    paymentElement = null;
  }
}

// Initialize payment form
async function initializePaymentForm() {
  try {
    // Initialize Stripe if not already done
    await initializeStripe();
    
    // Get client secret from server
    const response = await fetch(`${API_BASE_URL}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error('Failed to create payment intent');
    }
    
    const { clientSecret } = await response.json();
    
    // Create payment element with Apple Pay and all payment methods enabled
    elements = stripe.elements({ 
      clientSecret,
      appearance: {
        theme: 'stripe',
      },
      locale: 'en'
    });
    paymentElement = elements.create('payment', {
      layout: 'tabs',
      business: {
        name: 'MrPDF'
      },
      paymentMethodOrder: ['apple_pay', 'google_pay', 'link', 'card']
    });
    paymentElement.mount('#payment-element');
    
    // Handle form submission
    const form = document.getElementById('payment-form');
    form.addEventListener('submit', handleFormSubmit);
    
  } catch (error) {
    console.error('Error initializing payment:', error);
    showError('Failed to initialize payment. Please try again.');
    closePaymentModal();
  }
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const submitButton = document.getElementById('submit-payment');
  const messageDiv = document.getElementById('payment-message');
  
  submitButton.disabled = true;
  submitButton.textContent = 'Processing...';
  messageDiv.style.display = 'none';
  
  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/?payment=success',
      },
      redirect: 'if_required'
    });
    
    if (error) {
      messageDiv.textContent = error.message;
      messageDiv.className = 'payment-message error';
      messageDiv.style.display = 'block';
      submitButton.disabled = false;
      submitButton.textContent = 'Pay $1.00';
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Payment succeeded - mark as paid immediately
      markAsPaid();
      
      messageDiv.textContent = 'Payment successful! Processing your file...';
      messageDiv.className = 'payment-message success';
      messageDiv.style.display = 'block';
      
      // Close modal and verify payment
      setTimeout(() => {
        closePaymentModal();
        verifyPayment(paymentIntent.id);
      }, 1500);
    }
  } catch (error) {
    console.error('Payment error:', error);
    messageDiv.textContent = 'An error occurred. Please try again.';
    messageDiv.className = 'payment-message error';
    messageDiv.style.display = 'block';
    submitButton.disabled = false;
    submitButton.textContent = 'Pay $1.00';
  }
}

// Handle payment - show modal instead of redirecting
async function handlePayment() {
  showPaymentModal();
}

// Show background image first, then reveal main interface on top
function showMainInterface() {
  const container = document.getElementById('mainContainer');
  const introText = document.getElementById('introText');
  
  // Make container visible immediately
  if (container) {
    container.style.opacity = '1';
    container.classList.add('fade-in');
  }
  
  // Wait for background image to load
  const bgImage = document.querySelector('.background-image');
  if (bgImage) {
    if (bgImage.complete) {
      // Image already loaded
    } else {
      bgImage.addEventListener('load', () => {
        // Image loaded
      });
      bgImage.addEventListener('error', () => {
        console.error('Background image failed to load');
      });
    }
  }
  
  // Show intro text immediately
  if (introText) {
    introText.style.opacity = '1';
  }
  
  // Show upload area
  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) {
    uploadArea.style.opacity = '1';
    uploadArea.style.transform = 'translateY(0)';
  }
}

// Check for payment success on page load
// Settings Panel Controls
let currentGifScale = 1.71;
let currentGifPosition = 0;

function initializeSettings() {
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettings = document.getElementById('closeSettings');
    const gifScale = document.getElementById('gifScale');
    const gifPosition = document.getElementById('gifPosition');
    const gifScaleValue = document.getElementById('gifScaleValue');
    const gifPositionValue = document.getElementById('gifPositionValue');
    const displayScale = document.getElementById('displayScale');
    const displayPosition = document.getElementById('displayPosition');
    const copyValues = document.getElementById('copyValues');
    const mrpdfGif = document.getElementById('mrpdfGif');

    // Toggle settings panel
    if (settingsToggle) {
        settingsToggle.addEventListener('click', () => {
            settingsPanel.classList.toggle('open');
        });
    }

    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            settingsPanel.classList.remove('open');
        });
    }

    // Update GIF scale
    if (gifScale && mrpdfGif) {
        gifScale.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            currentGifScale = value;
            if (gifScaleValue) gifScaleValue.textContent = value.toFixed(2);
            if (displayScale) displayScale.textContent = value.toFixed(2);
            
            // Apply transform
            const currentTransform = mrpdfGif.style.transform || '';
            const positionMatch = currentTransform.match(/translateY\(([^)]+)\)/);
            const position = positionMatch ? positionMatch[1] : '0px';
            mrpdfGif.style.transform = `scale(${value}) translateY(${position})`;
        });
    }

    // Update GIF position
    if (gifPosition && mrpdfGif) {
        gifPosition.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            currentGifPosition = value;
            if (gifPositionValue) gifPositionValue.textContent = value + 'px';
            if (displayPosition) displayPosition.textContent = value + 'px';
            
            // Apply transform
            const currentTransform = mrpdfGif.style.transform || '';
            const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
            const scale = scaleMatch ? scaleMatch[1] : '1.1';
            mrpdfGif.style.transform = `scale(${scale}) translateY(${value}px)`;
        });
    }

    // Copy values to clipboard
    if (copyValues) {
        copyValues.addEventListener('click', () => {
            const values = `Scale: ${currentGifScale.toFixed(2)}, Position: ${currentGifPosition}px`;
            navigator.clipboard.writeText(values).then(() => {
                copyValues.textContent = 'Copied!';
                setTimeout(() => {
                    copyValues.textContent = 'Copy Values';
                }, 2000);
            });
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
  // Initialize settings panel
  initializeSettings();
  
  // Show background image first
  showMainInterface();
  
  const urlParams = new URLSearchParams(window.location.search);
  const payment = urlParams.get('payment');
  const sessionId = urlParams.get('session_id');
  
  if (payment === 'success' && sessionId) {
    verifyPayment(sessionId);
  }
  
  // Close modal handlers
  const closeModal = document.getElementById('closeModal');
  if (closeModal) {
    closeModal.addEventListener('click', closePaymentModal);
  }
  
  const paymentModal = document.getElementById('paymentModal');
  if (paymentModal) {
    paymentModal.addEventListener('click', (e) => {
      if (e.target.id === 'paymentModal') {
        closePaymentModal();
      }
    });
  }
  
  // Add click handler for GIF
  const mrpdfGif = document.getElementById('mrpdfGif');
  if (mrpdfGif) {
    mrpdfGif.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent uploadArea click handler from also firing
      fileInput.click();
    });
  }
  
  // No need to check usage on load - it's handled client-side
});

// Verify payment
async function verifyPayment(sessionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    
    const data = await response.json();
    if (data.success && data.paid) {
      // Mark as paid in localStorage so it persists
      markAsPaid();
      
      // If conversion completed, show result
      if (data.filename && data.downloadUrl) {
        showResult(data.filename, data.downloadUrl);
      } else {
        // Just refresh to show upload area again
        window.history.replaceState({}, document.title, '/');
        location.reload();
      }
    }
  } catch (error) {
    console.error('Payment verification error:', error);
  }
}

// Click to upload (only if not showing paywall)
uploadArea.addEventListener('click', (e) => {
    // Don't trigger upload if clicking on paywall content or the GIF (GIF has its own handler)
    if (e.target.closest('.paywall-content') || e.target.classList.contains('mrpdf-gif') || e.target.closest('.mrpdf-gif')) {
        return;
    }
    fileInput.click();
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function resetForm() {
    // Restore the original upload area content if it was replaced by paywall
    if (!uploadArea.querySelector('.mrpdf-gif')) {
        uploadArea.innerHTML = `
            <img src="MrPDF.gif" alt="MrPDF" class="mrpdf-gif" id="mrpdfGif">
            <input type="file" id="fileInput" accept="image/*,.html,.htm,.txt,.md,.pdf" hidden>
        `;
        // Re-attach event listeners
        const newFileInput = document.getElementById('fileInput');
        const newGif = document.getElementById('mrpdfGif');
        newFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
            }
        });
        if (newGif) {
            newGif.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent uploadArea click handler from also firing
                newFileInput.click();
            });
        }
    }
    
    // Show header and footer again
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (header) {
        header.style.display = 'block';
        header.style.opacity = '1';
    }
    if (footer) {
        footer.style.display = 'block';
        footer.style.opacity = '1';
    }
    
    // Reset upload area to initial state
    uploadArea.style.display = 'flex';
    uploadArea.style.opacity = '1';
    uploadArea.style.transform = 'translateY(0)';
    
    progressContainer.style.display = 'none';
    resultContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    fileInput.value = '';
    progressFill.style.width = '0%';
    
    // Ensure container is visible and properly styled
    const container = document.getElementById('mainContainer');
    if (container) {
        container.classList.add('fade-in');
        container.style.opacity = '1';
        container.style.transform = 'translate(-50%, -50%)';
    }
    
    // Usage is tracked client-side, no need to re-check
}

function showProgress() {
    uploadArea.style.display = 'none';
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    
    // Animate progress bar
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) {
            progress = 90;
        }
        progressFill.style.width = progress + '%';
    }, 200);
    
    return interval;
}

function showResult(filename, downloadUrl) {
    progressContainer.style.display = 'none';
    uploadArea.style.display = 'none';
    resultContainer.style.display = 'block';
    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    progressFill.style.width = '100%';
    
    // Hide header and footer when showing success
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
}

function showError(message) {
    progressContainer.style.display = 'none';
    errorContainer.style.display = 'block';
    errorMessage.textContent = message;
}

async function handleFile(file) {
    console.log('handleFile called with:', file.name, file.size, 'bytes');
    
    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
        showError('File size exceeds 50MB limit. Please upload a smaller file.');
        return;
    }

    // Check if payment is required (client-side check - 3 free conversions)
    const freeConversions = getFreeConversions();
    const canConvert = canConvertFree();
    console.log('Free conversions:', freeConversions, 'Can convert:', canConvert);
    
    if (!canConvert) {
        // Show paywall before uploading
        console.log('Showing paywall - free conversions exhausted');
        showPaywall();
        return;
    }

    const progressInterval = showProgress();

    const formData = new FormData();
    formData.append('file', file);

    // Add header if payment is required (for server-side handling)
    const headers = {};
    if (!canConvertFree()) {
        headers['X-Requires-Payment'] = 'true';
    }

    try {
        // Use API_BASE_URL if set (for deployed frontend), otherwise use relative URL (for localhost)
        const apiBaseUrl = window.API_BASE_URL || '';
        const response = await fetch(`${apiBaseUrl}/convert`, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = '100%';

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            console.error('Failed to parse response as JSON:', jsonError);
            const text = await response.text();
            console.error('Response text:', text);
            showError('Server error: Invalid response. Please try again.');
            return;
        }

        if (response.status === 402 && data.requiresPayment) {
            // File uploaded, now show paywall
            showPaywall();
        } else if (response.ok && data.success) {
            // Increment free conversion count (if not paid)
            if (!hasPaid()) {
                incrementFreeConversions();
            }
            
            setTimeout(() => {
                showResult(data.filename, data.downloadUrl);
            }, 500);
        } else {
            console.error('Conversion failed:', data);
            showError(data.error || 'Failed to convert file. Please try again.');
        }
    } catch (error) {
        clearInterval(progressInterval);
        showError('Network error. Please check your connection and try again.');
        console.error('Error:', error);
    }
}
