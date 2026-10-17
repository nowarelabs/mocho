// Browser entry point: registers every POS custom element.

import { MochoApp } from './components/app.ts';
import { MochoAppbar } from './components/appbar.ts';
import { MochoCart } from './components/cart.ts';
import { MochoCheckout } from './components/checkout.ts';
import { MochoInventory } from './components/inventory.ts';
import { MochoOrders } from './components/orders.ts';
import { MochoPanelTabs } from './components/paneltabs.ts';
import { MochoProductForm } from './components/product-form.ts';
import { MochoRegister } from './components/register.ts';
import { MochoReports } from './components/reports.ts';
import { MochoSidebar } from './components/sidebar.ts';
import { MochoToaster } from './components/toaster.ts';

const ELEMENTS: Record<string, CustomElementConstructor> = {
  'mocho-app': MochoApp,
  'mocho-appbar': MochoAppbar,
  'mocho-paneltabs': MochoPanelTabs,
  'mocho-sidebar': MochoSidebar,
  'mocho-register': MochoRegister,
  'mocho-cart': MochoCart,
  'mocho-checkout': MochoCheckout,
  'mocho-orders': MochoOrders,
  'mocho-inventory': MochoInventory,
  'mocho-product-form': MochoProductForm,
  'mocho-reports': MochoReports,
  'mocho-toaster': MochoToaster,
};

for (const [tag, cls] of Object.entries(ELEMENTS)) customElements.define(tag, cls);
