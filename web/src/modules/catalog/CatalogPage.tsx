import { PageHeader } from '../../components/PageHeader';
import { CATALOG_VIEWS } from '../parameters/parameterViews';
import { ParameterLists } from '../parameters/ParametersPage';

/** `/catalogo`: the structure that classifies products (brands, areas, groups, units of measure). */
export function CatalogPage() {
  return (
    <>
      <PageHeader title="Catálogo" />
      <ParameterLists views={CATALOG_VIEWS} tabsLabel="Catálogo" />
    </>
  );
}
