// Browser entry point: registers every POS custom element.

import { MochoApp } from './components/app.ts';
import { MochoAppbar } from './components/appbar.ts';
import { MochoCart } from './components/cart.ts';
import { MochoCatalog } from './components/catalog.ts';
import { MochoCheckout } from './components/checkout.ts';
import { MochoCustomers } from './components/customers.ts';
import { MochoInventory } from './components/inventory.ts';
import { MochoLogin } from './components/login.ts';
import { MochoPanelTabs } from './components/paneltabs.ts';
import { MochoProductForm } from './components/product-form.ts';
import { MochoReports } from './components/reports.ts';
import { MochoSales } from './components/sales.ts';
import { MochoSell } from './components/sell.ts';
import { MochoSettings } from './components/settings.ts';
import { MochoSidebar } from './components/sidebar.ts';
import { MochoStaff } from './components/staff.ts';
import { MochoToaster } from './components/toaster.ts';

const ELEMENTS: Record<string, CustomElementConstructor> = {
  'mocho-app': MochoApp,
  'mocho-appbar': MochoAppbar,
  'mocho-paneltabs': MochoPanelTabs,
  'mocho-sidebar': MochoSidebar,
  'mocho-login': MochoLogin,
  'mocho-sell': MochoSell,
  'mocho-sales': MochoSales,
  'mocho-catalog': MochoCatalog,
  'mocho-inventory': MochoInventory,
  'mocho-customers': MochoCustomers,
  'mocho-staff': MochoStaff,
  'mocho-reports': MochoReports,
  'mocho-settings': MochoSettings,
  'mocho-cart': MochoCart,
  'mocho-checkout': MochoCheckout,
  'mocho-product-form': MochoProductForm,
  'mocho-toaster': MochoToaster,
};

for (const [tag, cls] of Object.entries(ELEMENTS)) customElements.define(tag, cls);
