const API_URL_KEY = 'apiUrl';
const CACHE_KEY = 'productCache';
const CACHE_TIME_KEY = 'cacheTime';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 giờ

let codeReader = null;

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updateStatus(navigator.onLine);
});

// ========== TABS ==========
function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(tabName + '-tab').style.display = 'block';
  event.target.classList.add('active');
}

// ========== SEARCH ==========
function handleEnter(e) {
  if (e.key === 'Enter') search();
}

async function search() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) {
    showMessage('results', 'error', 'Vui lòng nhập để tìm kiếm');
    return;
  }
  
  showLoading('results');
  
  try {
    const results = await queryAPI('search', {query});
    displayResults(results.data || []);
  } catch (error) {
    showMessage('results', 'error', error.message);
  }
}

async function loadAll() {
  showLoading('results');
  
  try {
    const results = await queryAPI('getAll', {});
    displayResults(results.data || []);
  } catch (error) {
    showMessage('results', 'error', error.message);
  }
}

function displayResults(data) {
  const resultsDiv = document.getElementById('results');
  
  if (!data.length) {
    resultsDiv.innerHTML = '<div class="empty-state">Không tìm thấy kết quả</div>';
    return;
  }
  
  resultsDiv.innerHTML = data.map(item => `
    <div class="result-item">
      <div class="product-name">${item.name}</div>
      <div class="product-code">${item.barcode}</div>
      <div class="product-details">
        <div class="detail">
          <span class="detail-label">Giá:</span>
          <span class="detail-value price">${formatPrice(item.price)}</span>
        </div>
        <div class="detail">
          <span class="detail-label">Tồn:</span>
          <span class="detail-value">${item.stock}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ========== SCAN BARCODE ==========
async function startCamera() {
  const cameraContainer = document.getElementById('camera-container');
  const video = document.getElementById('video');
  
  cameraContainer.style.display = 'block';
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    
    video.srcObject = stream;
    video.play();
    
    // Init barcode reader
    codeReader = new ZXing.BrowserMultiFormatReader();
    scanBarcode(video);
  } catch (error) {
    showMessage('scan-results', 'error', 'Không thể mở camera: ' + error.message);
  }
}

function stopCamera() {
  const video = document.getElementById('video');
  const stream = video.srcObject;
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  document.getElementById('camera-container').style.display = 'none';
  if (codeReader) {
    codeReader.reset();
  }
}

async function scanBarcode(video) {
  const scanResultsDiv = document.getElementById('scan-results');
  
  const decodeOnceFromVideoElement = async () => {
    try {
      const result = await codeReader.decodeFromVideoElement(video);
      if (result) {
        const barcode = result.text;
        await handleScannedBarcode(barcode);
        
        // Continue scanning
        setTimeout(decodeOnceFromVideoElement, 500);
      } else {
        setTimeout(decodeOnceFromVideoElement, 500);
      }
    } catch (err) {
      // Continue trying
      setTimeout(decodeOnceFromVideoElement, 500);
    }
  };
  
  decodeOnceFromVideoElement();
}

async function handleScannedBarcode(barcode) {
  showLoading('scan-results');
  
  try {
    const results = await queryAPI('search', {query: barcode});
    if (results.data && results.data.length > 0) {
      displayResults(results.data);
      showMessage('scan-results', 'success', `✓ Tìm thấy: ${results.data[0].name}`);
    } else {
      showMessage('scan-results', 'error', `Barcode không tồn tại: ${barcode}`);
    }
  } catch (error) {
    showMessage('scan-results', 'error', error.message);
  }
}

// ========== API CALLS ==========
async function queryAPI(action, params) {
  const apiUrl = localStorage.getItem(API_URL_KEY);
  if (!apiUrl) {
    throw new Error('❌ Chưa cấu hình Apps Script URL');
  }
  
  const fullUrl = `${apiUrl}?action=${action}&query=${encodeURIComponent(params.query || '')}`;
  
  // Try online first
  if (navigator.onLine) {
    try {
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = await response.json();
      if (data.success) {
        // Cache kết quả
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      }
      return data;
    } catch (error) {
      console.error('API call failed:', error);
      // Fall back to cache
      return getCachedData();
    }
  } else {
    // Offline mode - use cache
    return getCachedData();
  }
}

function getCachedData() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) {
    throw new Error('📴 Offline - Không có dữ liệu cache');
  }
  return JSON.parse(cached);
}

// ========== SETTINGS ==========
function saveSettings() {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  if (!apiUrl) {
    showMessage('sync-status', 'error', 'Vui lòng nhập URL');
    return;
  }
  
  localStorage.setItem(API_URL_KEY, apiUrl);
  showMessage('sync-status', 'success', '✓ Đã lưu cấu hình');
}

function loadSettings() {
  const apiUrl = localStorage.getItem(API_URL_KEY);
  if (apiUrl) {
    document.getElementById('apiUrl').value = apiUrl;
  }
}

async function syncData() {
  const syncStatus = document.getElementById('sync-status');
  syncStatus.innerHTML = '<div class="spinner"></div>Đang đồng bộ...';
  
  try {
    const results = await queryAPI('getAll', {});
    localStorage.setItem(CACHE_KEY, JSON.stringify(results));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    
    syncStatus.innerHTML = `<div class="success">✓ Đã đồng bộ ${results.count} sản phẩm</div>`;
  } catch (error) {
    syncStatus.innerHTML = `<div class="error">❌ ${error.message}</div>`;
  }
}

function clearCache() {
  if (confirm('Bạn chắc chắn muốn xóa cache?')) {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
    document.getElementById('sync-status').innerHTML = '<div class="success">✓ Đã xóa cache</div>';
  }
}

// ========== UI HELPERS ==========
function updateStatus(isOnline) {
  const status = document.getElementById('status');
  status.className = isOnline ? 'status online' : 'status offline';
  status.textContent = isOnline ? '🟢 Online' : '🔴 Offline';
}

function showLoading(elementId) {
  document.getElementById(elementId).innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>Đang tải...</div>
    </div>
  `;
}

function showMessage(elementId, type, message) {
  const element = document.getElementById(elementId);
  element.innerHTML = `<div class="${type}">${message}</div>`;
}

function formatPrice(price) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price);
}
