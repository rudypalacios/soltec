import { Tab, Tabs } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useCan } from '../access/SessionContext';

/**
 * Products and bundles are two sections with their own permissions but one catalog to the person using them, so
 * their lists share a bar of tabs. It appears only for whoever may view both; with one of them there is nothing to
 * switch to.
 */
export function CatalogTabs({ current }: { current: 'products' | 'bundles' }) {
  const can = useCan();
  if (!can('products', 'view') || !can('bundles', 'view')) {
    return null;
  }
  return (
    <Tabs value={current} aria-label="Productos y paquetes" sx={{ mb: 2, minHeight: 44 }}>
      <Tab
        component={RouterLink}
        to="/productos"
        value="products"
        label="Productos"
        sx={{ minHeight: 44 }}
      />
      <Tab
        component={RouterLink}
        to="/paquetes"
        value="bundles"
        label="Paquetes"
        sx={{ minHeight: 44 }}
      />
    </Tabs>
  );
}
