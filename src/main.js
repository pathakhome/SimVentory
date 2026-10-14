/**
 * SimVentory — Main Application Entry Point
 * Handles routing, navigation, theme, and view orchestration.
 */
import './style.css';
import { renderDashboard } from './views/dashboard.js';
import { renderInventory } from './views/inventory.js';
import { renderItemForm } from './views/itemForm.js';
import { renderQueue } from './views/queue.js';
import { renderSettings } from './views/settings.js';
import { openItemDetailModal } from './views/itemModal.js';
import { openScannerModal } from './views/scannerModal.js';
import { fetchAISettings } from './services/aiService.js';
import { subscribeQueue, getQueueSummary } from './services/queueService.js';

// ---- State ----
let currentView = 'dashboard';
let viewParams = {};

// ---- DOM References ----
const mainContent = document.getElementById('main-content');
const navItems = document.querySelectorAll('.nav-item[data-view]');
const mobileQueueBtn = document.getElementById('mobile-queue-btn');
const navQueueBadge = document.getElementById('nav-queue-badge');
const mobileQueueBadge = document.getElementById('mobile-queue-badge');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const themeToggle = document.getElementById('theme-toggle');

// ---- Theme ----
function initTheme() {
  const saved = localStorage.getItem('cv_theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  updateThemeLabel(saved);
}

function updateThemeLabel(theme) {
  const label = document.querySelector('.theme-label');
  if (label) label.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('cv_theme', next);
  updateThemeLabel(next);
});

// ---- Navigation ----
let currentViewCleanup = null;

function navigateTo(view, params = {}) {
  if (typeof currentViewCleanup === 'function') {
    try {
      currentViewCleanup();
    } catch (e) {
      console.warn('[Router] View cleanup error:', e);
    }
    currentViewCleanup = null;
  }

  currentView = view;
  viewParams = params;

  // Update active nav item
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  // Close mobile sidebar
  closeMobileSidebar();

  // Render the view
  renderCurrentView();
}

async function renderCurrentView() {
  const context = {
    navigateTo,
    openItemModal: (id) => openItemDetailModal(id, { navigateTo, refreshView: () => renderCurrentView() }),
    openScanner: (options = {}) => openScannerModal({ navigateTo, openItemModal: context.openItemModal, ...options }),
    refreshView: () => renderCurrentView(),
  };

  let cleanup = null;
  switch (currentView) {
    case 'dashboard':
      cleanup = await renderDashboard(mainContent, context);
      break;
    case 'inventory':
      cleanup = await renderInventory(mainContent, context);
      break;
    case 'add-item':
      cleanup = await renderItemForm(mainContent, {
        ...context,
        editItemId: viewParams.editItemId || null,
        cloneItemId: viewParams.cloneItemId || null,
        prefillPartNumber: viewParams.prefillPartNumber || null,
      });
      break;
    case 'queue':
      cleanup = await renderQueue(mainContent, context);
      break;
    case 'settings':
      cleanup = await renderSettings(mainContent, context);
      break;
    default:
      cleanup = await renderDashboard(mainContent, context);
  }

  if (typeof cleanup === 'function') {
    currentViewCleanup = cleanup;
  }
}

// Nav item clicks
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navigateTo(item.dataset.view);
  });
});

// Mobile Queue button click
if (mobileQueueBtn) {
  mobileQueueBtn.addEventListener('click', () => {
    navigateTo('queue');
  });
}

// Queue Badge synchronization
function updateQueueBadges(summary) {
  const count = summary.total;
  if (navQueueBadge) {
    navQueueBadge.textContent = count;
    navQueueBadge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (mobileQueueBadge) {
    mobileQueueBadge.textContent = count;
    mobileQueueBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

subscribeQueue((_, summary) => updateQueueBadges(summary));
updateQueueBadges(getQueueSummary());

// ---- Mobile Sidebar ----
function openMobileSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
}

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

mobileMenuBtn.addEventListener('click', () => {
  if (sidebar.classList.contains('open')) {
    closeMobileSidebar();
  } else {
    openMobileSidebar();
  }
});

sidebarOverlay.addEventListener('click', closeMobileSidebar);

// ---- Keyboard Shortcuts ----
document.addEventListener('keydown', (e) => {
  // Ctrl+K or Cmd+K to focus search (when on inventory)
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (currentView !== 'inventory') {
      navigateTo('inventory');
    }
    setTimeout(() => {
      const searchInput = document.getElementById('inventory-search');
      if (searchInput) searchInput.focus();
    }, 100);
  }
});

// ---- Init ----
initTheme();
fetchAISettings().catch(() => {});
renderCurrentView();
