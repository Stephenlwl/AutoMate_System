import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, getDocs, getDoc, where, query, deleteDoc, doc, setDoc } from '@angular/fire/firestore';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth/service-center-auth';
import { Modal } from 'bootstrap';

// define on the presets year range
type YearPreset = 'latest5' | 'all';

// define service offer that stored in db
interface ServiceOffer {
  id: string;
  serviceCenterId: string;
  categoryId: string;
  serviceId: string;
  tierId?: string | null;
  makes: string[];
  models: Record<string, string[]>; // for supporting in a grouped data
  years: Record<string, number[]>;
  fuelTypes: Record<string, string[]>;
  displacements: Record<string, number[]>;
  sizeClasses: Record<string, string[]>;
  duration: number;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
}

// define tier that stored in db
interface Tier {
  id: string;
  tierName: string;
  serviceCenterId: string;
  makes: string[];
  models: Record<string, string[]>;
  years: Record<string, number[]>;
  fuelTypes: Record<string, string[]>;
  displacements: Record<string, number[]>;
  sizeClasses: Record<string, string[]>;
}

// define fitment information if no tier is linked
interface CarFitments {
  makes: string[];
  models: Record<string, string[]>;
  years: Record<string, number[]>;
  fuelTypes: Record<string, string[]>;
  displacements: Record<string, number[]>;
  sizeClasses: Record<string, string[]>;
}

// for showing the relavent service offer data
interface EnrichedServiceOffer extends ServiceOffer {
  service?: { id: string; name: string;[key: string]: any };
  category?: { id: string; name: string;[key: string]: any };
  tier?: Tier;
  carFitments?: CarFitments;
}

@Component({
  selector: 'app-manage-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, FormsModule],
  styleUrls: ['./manage-services.component.css'],
  templateUrl: './manage-services.component.html'
})

export class ServiceCenterServiceComponent implements OnInit {
  // all service offers by the service center
  serviceOffers: EnrichedServiceOffer[] = [];
  error = '';

  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  //declare tab
  tab: 'service' | 'tier' = 'service';
  serviceCenterId!: string;
  viewCategories: any[] = [];
  filteredCategories: any[] = [];
  offeredCategories: any[] = [];

  searchInput: string = '';
  filterMake: string = '';
  filterYear: string = '';
  filterFuelType: string = '';
  filterDisplacement: string = '';
  filterSizeClass: string = '';

  allMakes: string[] = [];
  allYears: number[] = [];
  allFuelTypes: string[] = [];
  allDisplacements: number[] = [];
  allSizeClasses: string[] = [];

  // services and category from firestore
  serviceForm!: FormGroup;
  serviceOffered: any[] = [];
  serviceCategories: any[] = [];
  serviceTiers: any[] = [];
  categories: any[] = [];
  servicesByCategory: Record<string, any[]> = {}; // based on categoryId to define services[]
  servicesByOffered: Record<string, any[]> = {}; // based on serviceOfferedId to define services[]
  selectedMakesSvc: string[] = [];
  modelSearchSvc: Record<string, string> = {};
  selectedModelsSvc: Record<string, string[]> = {};
  selectedYearsSvc: Record<string, number[]> = {};
  selectedFuelTypesSvc: Record<string, string[]> = {};
  selectedDisplacementsSvc: Record<string, number[]> = {};
  selectedSizeClassesSvc: Record<string, string[]> = {};

  svcError = '';
  svcInfo = '';
  brandWideDisabledSvc = false;

  // pick from Category to Service to Tier
  pick = {
    categoryId: '',
    serviceId: '',
    tierId: ''
  };

  pricing = {
    type: 'fixed' as 'fixed' | 'range',
    price: null as number | null,
    priceMin: null as number | null,
    priceMax: null as number | null,
    duration: null as number | null
  };

  // tiers from firestore
  tierForm!: FormGroup;
  savedTiers: any[] = [];
  selectedTier: any = null;
  // data sources
  makes: string[] = [];
  modelsByMake: { [make: string]: string[] } = {};
  // selected states
  selectedMakes: string[] = [];
  selectedModels: { [make: string]: string[] } = {};
  yearsByModel: { [model: string]: number[] } = {};
  fuelTypesByModel: { [model: string]: string[] } = {};
  displacementsByModel: { [model: string]: number[] } = {};
  sizeClassesByModel: { [model: string]: string[] } = {};
  selectedYears: { [model: string]: number[] } = {};
  selectedFuelTypes: { [model: string]: string[] } = {};
  selectedDisplacements: { [model: string]: number[] } = {};
  selectedSizeClasses: { [model: string]: string[] } = {};
  // searching, filtering, expanding
  modelSearch: { [make: string]: string } = {};
  expandMake: { [make: string]: boolean } = {};
  expandModel: { [model: string]: boolean } = {};
  yearRangeForMake: { [make: string]: { start?: number; end?: number } } = {};

  loading = false;
  errorMessage = '';
  infoMessage = '';

  ngOnInit() {
    this.initServiceTab();
    this.serviceCenterId = this.auth.getAdmin().id;
    this.tierForm = this.fb.group({
      tierName: ['', Validators.required],
    });
    this.loadServiceOffered();
    this.loadSavedTiers();
    this.fetchMakes();
  }

  async initServiceTab() {
    this.loading = true;
    const categorySnapshot = await getDocs(query(collection(this.firestore, 'services_categories')));
    this.categories = categorySnapshot.docs.map(category => ({ id: category.id, ...category.data() }));

    // preload services which grouped by category
    this.servicesByCategory = {};
    for (const category of this.categories) {
      const serviceSnapshot = await getDocs(
        query(
          collection(this.firestore, 'services'),
          where('categoryId', '==', category['id']),
        )
      );
      this.servicesByCategory[category['id']] = serviceSnapshot.docs.map(service => ({ id: service.id, ...service.data() }));
    }

    // Load service center tiers
    const tierSnap = await getDocs(query(collection(this.firestore, 'service_center_service_tiers'), where('serviceCenterId', '==', this.serviceCenterId)));
    this.serviceTiers = tierSnap.docs.map(tier => ({ id: tier.id, ...tier.data() }));

    // fetch cake brand if no
    if (!this.makes?.length) {
      this.fetchMakes();
      this.loading = false;
    } else {
      this.loading = false;
    }
  }

  async loadServiceOffered() {
    this.loading = true;
    this.error = '';

    try { // fetch service offer
      const offerRef = collection(this.firestore, 'service_center_services_offer');
      const q = query(offerRef, where('serviceCenterId', '==', this.serviceCenterId));

      const offerSnap = await getDocs(q);
      const offers: ServiceOffer[] = offerSnap.docs.map(docSnap => {
        const data = docSnap.data() as ServiceOffer;
        return { serviceOfferId: docSnap.id, ...data };
      });

      const enrichedOffers: EnrichedServiceOffer[] = [];

      for (const offer of offers) {
        const enrichedOffer: EnrichedServiceOffer = { ...offer };

        // Related service
        if (offer.serviceId) {
          const serviceSnap = await getDoc(doc(this.firestore, 'services', offer.serviceId));
          if (serviceSnap.exists()) {
            const data = serviceSnap.data() as { name: string;[key: string]: any };
            enrichedOffer.service = { id: serviceSnap.id, ...data };
          }
        }

        // Related category
        if (offer.categoryId) {
          const categorySnap = await getDoc(doc(this.firestore, 'services_categories', offer.categoryId));
          if (categorySnap.exists()) {
            const data = categorySnap.data() as { name: string;[key: string]: any };
            enrichedOffer.category = { id: categorySnap.id, ...data };
          }
        }

        // Related tier
        if (offer.tierId) {
          const tierSnap = await getDoc(doc(this.firestore, 'service_center_service_tiers', offer.tierId));
          if (tierSnap.exists()) {
            // get raw Firestore data and cast to Tier without the id yet
            enrichedOffer.tier = { id: tierSnap.id, ...(tierSnap.data() as Omit<Tier, 'id'>) };
          }
        }

        // car fitments from the service offer 
        if (offer.makes?.length || Object.keys(offer.models || {}).length) {
          enrichedOffer.carFitments = {
            makes: offer.makes || [],
            models: offer.models || {},
            years: offer.years || {},
            fuelTypes: offer.fuelTypes || {},
            displacements: offer.displacements || {},
            sizeClasses: offer.sizeClasses || {}
          };
        }

        enrichedOffers.push(enrichedOffer);
      }

      this.serviceOffers = enrichedOffers;

      // define makes and years
      const makesSet = new Set<string>();
      const yearsSet = new Set<number>();

      this.serviceOffers.forEach(offer => {
        // from Tier
        if (offer.tier) {
          Object.keys(offer.tier.models || {}).forEach(make => makesSet.add(make));
          Object.values(offer.tier.years || {}).forEach(yearArr =>
            yearArr.forEach(year => yearsSet.add(year))
          );
        }

        // from Car Fitments
        if (offer.carFitments) {
          offer.carFitments.makes.forEach(make => makesSet.add(make));
          Object.values(offer.carFitments.years || {}).forEach(yearArr =>
            yearArr.forEach(year => yearsSet.add(year))
          );
        }
      });

      // convert to arrays and sort
      this.allMakes = Array.from(makesSet).sort();
      this.allYears = Array.from(yearsSet).sort((a, b) => a - b);

    } catch (err: any) {
      this.error = err.message || 'Failed to load service offers';
    } finally {
      this.loading = false;
      this.applyFilters();
    }
  }

  applyFilters() {
    this.filteredCategories = this.serviceOffers.filter(offer => {
      const serviceName = offer.service?.name?.toLowerCase() || '';
      const matchesSearch = this.searchInput
        ? serviceName.includes(this.searchInput.toLowerCase())
        : true;

      // match by make in either tier or car fitments
      const matchesMake = this.filterMake
        ? offer.tier?.makes?.includes(this.filterMake) || offer.carFitments?.makes?.includes(this.filterMake)
        : true;

        // match by year in either tier or car fitments
      const matchesYear = this.filterYear
        ? this.matchesYearFilter(offer, this.filterYear)
        : true;

      return matchesSearch && matchesMake && matchesYear;
    });
  }

  // check years
  private matchesYearFilter(offer: any, year: string): boolean {
    const tierYears = offer.tier?.years || {};
    const fitmentYears = offer.carFitments?.years || {};

    return (
      Object.values(tierYears).some((arr: any) => (arr as number[]).includes(+year)) ||
      Object.values(fitmentYears).some((arr: any) => (arr as number[]).includes(+year))
    );
  }

  getYearValues(value: unknown): string {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return '';
  }

  formatPrice(offer: ServiceOffer): string {
    if (offer.price != null) return `RM ${offer.price}`;
    if (offer.priceMin != null && offer.priceMax != null) return `RM ${offer.priceMin} - RM ${offer.priceMax}`;
    return 'N/A';
  }

  resetFilters() {
    this.searchInput = '';
    this.filterMake = '';
    this.filterYear = '';
    this.applyFilters();
  }

  onPickCategory() {
    this.pick.serviceId = '';
  }

  applyTierToPricing() {
    if (!this.pick.tierId) return;
    const tier = this.serviceTiers.find(x => x.id === this.pick.tierId);
    if (!tier) return;
    this.pricing.price = (tier.price ?? null);
    this.pricing.priceMin = (tier.priceMin ?? null);
    this.pricing.priceMax = (tier.priceMax ?? null);
    this.pricing.duration = (tier.duration ?? null);
    // choose pricing type based on fields present
    this.pricing.type = this.pricing.price != null ? 'fixed' : 'range';
  }

  onPricingTypeChange() {
    if (this.pricing.type === 'fixed') {
      this.pricing.priceMin = this.pricing.priceMax = null;
    } else {
      this.pricing.price = null;
    }
  }

  onMakeSvcToggle(make: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedMakesSvc.includes(make)) {
        this.selectedMakesSvc.push(make);
      }
      if (!this.modelsByMake[make]) {
        this.fetchModels(make);
      }
    } else {
      this.selectedMakesSvc = this.selectedMakesSvc.filter(m => m !== make);
      delete this.selectedModelsSvc[make];
    }
  }

  getFilteredModelsSvc(make: string): string[] {
    const list = this.modelsByMake[make] || [];
    const searchInput = (this.modelSearchSvc[make] || '').trim().toLowerCase();
    if (!searchInput) {
      return list;
    }
    this.brandWideDisabledSvc = true;
    return list.filter(make => make.toLowerCase().includes(searchInput));
  }

  isSvcModelSelected(make: string, model: string) {
    return (this.selectedModelsSvc[make] || []).includes(model);
  }

  toggleSvcModel(make: string, model: string) {
    const arr = this.selectedModelsSvc[make] || (this.selectedModelsSvc[make] = []);
    const index = arr.indexOf(model);
    if (index === -1) {
      arr.push(model);
      this.fetchFiltersForModel(make, model);
    } else {
      arr.splice(index, 1);
      delete this.selectedYearsSvc[model];
      delete this.selectedFuelTypesSvc[model];
      delete this.selectedDisplacementsSvc[model];
      delete this.selectedSizeClassesSvc[model];
    }
  }

  toggleYearSvc(model: string, year: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const arr = this.selectedYearsSvc[model] || (this.selectedYearsSvc[model] = []);
    if (checked) {
      if (!arr.includes(year)) {
        arr.push(year);
      }
    }
    else {
      this.selectedYearsSvc[model] = arr.filter(v => v !== year);
    }
  }

  toggleFuelSvc(model: string, fuel: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const arr = this.selectedFuelTypesSvc[model] || (this.selectedFuelTypesSvc[model] = []);
    if (checked) {
      if (!arr.includes(fuel)) {
        arr.push(fuel);
      }
    }
    else {
      this.selectedFuelTypesSvc[model] = arr.filter(v => v !== fuel);
    }
  }

  toggleDispSvc(model: string, displacement: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const arr = this.selectedDisplacementsSvc[model] || (this.selectedDisplacementsSvc[model] = []);
    if (checked) {
      if (!arr.includes(displacement)) {
        arr.push(displacement);
      }
    }
    else {
      this.selectedDisplacementsSvc[model] = arr.filter(v => v !== displacement);
    }
  }

  toggleSizeSvc(model: string, size: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const arr = this.selectedSizeClassesSvc[model] || (this.selectedSizeClassesSvc[model] = []);
    if (checked) {
      if (!arr.includes(size)) {
        arr.push(size);
      }
    }
    else {
      this.selectedSizeClassesSvc[model] = arr.filter(v => v !== size);
    }
  }

  applyYearPresetToMakeSvc(make: string, preset: YearPreset) {
    (this.selectedModelsSvc[make] || []).forEach(model => {
      const src = this.yearsByModel[model] || [];
      let out: number[] = [];
      if (preset === 'latest5') out = src.slice(0, 5);
      if (preset === 'all') out = src.slice();
      this.selectedYearsSvc[model] = out;
    });
  }

  getFilteredFuelTypesSvc(make: string): string[] {
    const selected = (this.selectedModelsSvc[make] || []);
    const filtered = this.getFilteredModelsSvc(make);
    const model = selected.filter(m => filtered.includes(m));
    const set = new Set<string>();
    model.forEach(m => (this.fuelTypesByModel[m] || []).forEach(f => set.add(f)));
    this.brandWideDisabledSvc = filtered.length > 0 && filtered.length !== (this.modelsByMake[make] || []).length;
    return Array.from(set).sort();
  }

  getFilteredDisplacementsSvc(make: string): number[] {
    const selected = (this.selectedModelsSvc[make] || []);
    const filtered = this.getFilteredModelsSvc(make);
    const model = selected.filter(m => filtered.includes(m));
    const set = new Set<number>();
    model.forEach(m => (this.displacementsByModel[m] || []).forEach(d => set.add(d)));
    return Array.from(set).sort((a, b) => b - a);
  }

  getFilteredSizeClassesSvc(make: string): string[] {
    const selected = (this.selectedModelsSvc[make] || []);
    const filtered = this.getFilteredModelsSvc(make);
    const model = selected.filter(m => filtered.includes(m));
    const set = new Set<string>();
    model.forEach(m => (this.sizeClassesByModel[m] || []).forEach(s => set.add(s)));
    return Array.from(set).sort();
  }

  applyFuelTypeToMakeSvc(make: string, fuel: string) {
    (this.selectedModelsSvc[make] || []).forEach(model => {
      // only apply if model actually supports this fuel
      if ((this.fuelTypesByModel[model] || []).includes(fuel)) {
        const arr = this.selectedFuelTypesSvc[model] || (this.selectedFuelTypesSvc[model] = []);
        if (!arr.includes(fuel)) arr.push(fuel);
      }
    });
  }

  applyDisplacementToMakeSvc(make: string, disp: number) {
    (this.selectedModelsSvc[make] || []).forEach(model => {
      if ((this.displacementsByModel[model] || []).includes(disp)) {
        const arr = this.selectedDisplacementsSvc[model] || (this.selectedDisplacementsSvc[model] = []);
        if (!arr.includes(disp)) arr.push(disp);
      }
    });
  }

  applySizeClassToMakeSvc(make: string, size: string) {
    (this.selectedModelsSvc[make] || []).forEach(model => {
      if ((this.sizeClassesByModel[model] || []).includes(size)) {
        const arr = this.selectedSizeClassesSvc[model] || (this.selectedSizeClassesSvc[model] = []);
        if (!arr.includes(size)) arr.push(size);
      }
    });
  }

  svcSelectedPairs() {
    const output: { make: string; model: string }[] = [];
    Object.keys(this.selectedModelsSvc).forEach(make => {
      (this.selectedModelsSvc[make] || []).forEach(model => output.push({ make, model }));
    });
    return output;
  }

  async saveOffer() {
    try {
      this.svcError = ''; this.svcInfo = '';

      // validate selection
      if (!this.pick.categoryId || !this.pick.serviceId) {
        this.svcError = 'Please select category and service.'; return;
      }
      if (this.selectedMakesSvc.length === 0 && !this.pick.tierId) {
        this.svcError = 'Please select at least one car make/model or select a tier you have created.'; return;
      }
      if (this.pricing.type === 'fixed' && (this.pricing.price == null || this.pricing.price < 0)) {
        this.svcError = 'Please enter a valid fixed price.'; return;
      }
      if (this.pricing.type === 'range' && (this.pricing.priceMin == null || this.pricing.priceMax == null || this.pricing.priceMin < 0 || this.pricing.priceMin > 9999 || this.pricing.priceMax <= 1 || this.pricing.priceMax >= 9999)) {
        this.svcError = 'Please enter a valid price range.'; return;
      }
      if (!this.pricing.duration || this.pricing.duration <= 5) {
        this.svcError = 'Please enter a valid duration at least 5 mins.'; return;
      }

      // fitments of only persist values the admin actually selected
      const models: Record<string, string[]> = {};
      const years: Record<string, number[]> = {};
      const fuel: Record<string, string[]> = {};
      const disp: Record<string, number[]> = {};
      const size: Record<string, string[]> = {};

      Object.keys(this.selectedModelsSvc).forEach(make => {
        const selectedModels = (this.selectedModelsSvc[make] || []);
        if (selectedModels.length) models[make] = selectedModels;

        selectedModels.forEach(m => {
          if (this.selectedYearsSvc[m]?.length) {
            years[m] = [...this.selectedYearsSvc[m]];
          }
          if (this.selectedFuelTypesSvc[m]?.length) {
            fuel[m] = [...this.selectedFuelTypesSvc[m]];
          }
          if (this.selectedDisplacementsSvc[m]?.length) {
            disp[m] = [...this.selectedDisplacementsSvc[m]];
          }
          if (this.selectedSizeClassesSvc[m]?.length) {
            size[m] = [...this.selectedSizeClassesSvc[m]];
          }
        });
      });

      const payload: any[] = [
        {
          serviceCenterId: this.serviceCenterId,
          categoryId: this.pick.categoryId,
          serviceId: this.pick.serviceId,
          tierId: this.pick.tierId || null,
          carFitments: {
            makes: [...this.selectedMakesSvc],
            models,
            years,
            fuelTypes: fuel,
            displacements: disp,
            sizeClasses: size
          },
          duration: this.pricing.duration,
          price: this.pricing.type === 'fixed' ? this.pricing.price : null,
          priceMin: this.pricing.type === 'range' ? this.pricing.priceMin : null,
          priceMax: this.pricing.type === 'range' ? this.pricing.priceMax : null,
        }
      ];

      for (const serviceOffer of payload) {
        // if has tierId validate against the tier's fitments
        if (serviceOffer.tierId) {
          const tierRef = doc(this.firestore, "service_center_tiers", serviceOffer.tierId);
          const tierSnap = await getDoc(tierRef);

          if (tierSnap.exists()) {
            const tierData: any = tierSnap.data();

            const seen = new Map();

            // compare saved tier fitments and the new one
            for (const fit of (tierData.fitments || [])) {
              const key = `${serviceOffer.categoryId}_${serviceOffer.serviceId}_${fit.make}_${fit.model}_${fit.years}_${fit.fuels}_${fit.displacements}_${fit.sizes}`;
              seen.set(key, true);
            }

            //  check new fitments from payload
            for (const make of serviceOffer.makes) {
              const fitKey = `${serviceOffer.categoryId}_${serviceOffer.serviceId}_${make}_${JSON.stringify(serviceOffer.models[make] || [])}_${JSON.stringify(serviceOffer.years[make] || [])}_${JSON.stringify(serviceOffer.fuelTypes[make] || [])}_${JSON.stringify(serviceOffer.displacements[make] || [])}_${JSON.stringify(serviceOffer.sizeClasses[make] || [])}`;

              if (seen.has(fitKey)) {
                this.svcError = "Duplicate fitment in same service with conflicting tier.";
                return;
              }
              seen.set(fitKey, true);
            }
          }
        }
      }

      payload.forEach(async (serviceOffer: any) => {
        if (serviceOffer.id) {
          await setDoc(doc(this.firestore, 'service_center_services_offer', serviceOffer.id), serviceOffer, { merge: true });
          alert("The service you have successfully updated!");
        } else {
          await addDoc(collection(this.firestore, 'service_center_services_offer'), serviceOffer);
          alert("The service you have successfully created!");
        }
      });
      this.resetServiceUI();
      await this.initServiceTab();
    } catch (err: any) {
      this.svcError = err?.message || 'Failed to save offer';
    }
  }

  resetServiceUI() {
    this.pick = { categoryId: '', serviceId: '', tierId: '' };
    this.pricing = { type: 'fixed', price: null, priceMin: null, priceMax: null, duration: null };
    this.selectedMakesSvc = [];
    this.selectedModelsSvc = {};
    this.modelSearchSvc = {};
    this.selectedYearsSvc = {};
    this.selectedFuelTypesSvc = {};
    this.selectedDisplacementsSvc = {};
    this.selectedSizeClassesSvc = {};
    this.brandWideDisabledSvc = false;
  }

  async deleteService(serviceId: string) {
    try {
      await deleteDoc(doc(this.firestore, 'services', serviceId));
      await this.initServiceTab();
    } catch (err: any) {
      this.svcError = err.message;
    }
  }

  //  Tier tab
  async loadSavedTiers(): Promise<void> {
    try {
      const tiersRef = collection(this.firestore, 'service_center_service_tiers');
      const q = query(tiersRef, where('serviceCenterId', '==', this.serviceCenterId));
      const snapshot = await getDocs(q);

      this.savedTiers = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          tierName: data.tierName ?? 'Untitled',
          makes: data.makes ?? [],
          models: data.models ?? {},
          years: data.years ?? {},
          fuelTypes: data.fuelTypes ?? {},
          displacements: data.displacements ?? {},
          sizeClasses: data.sizeClasses ?? {},
          serviceCenterId: data.serviceCenterId
        };
      });
    } catch (err) {
      console.error('Failed to load service tiers:', err);
    }
  }

  async duplicateTier(tier: any) {
    const copy = {
      tierName: `${tier.tierName} *Copy`,
      serviceCenterId: this.serviceCenterId,
      makes: tier.makes,
      models: tier.models,
      years: tier.years,
      fuelTypes: tier.fuelTypes,
      displacements: tier.displacements,
      sizeClasses: tier.sizeClasses,
    };
    try {
      await addDoc(collection(this.firestore, 'service_center_service_tiers'), copy);
      alert('Tier duplicated!');
      this.loadSavedTiers();
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to duplicate tier';
    }
  }

  formatValues(values: unknown): string {
    return Array.isArray(values) ? values.join(', ') : ' ';
  }

  openDetails(tier: any) {
    this.selectedTier = tier;
    const modalEl = document.getElementById('detailsModal');
    if (modalEl) new Modal(modalEl).show();
  }

  editTier(tier: any) {
    this.selectedTier = tier;
    this.tierForm.patchValue({
      tierName: tier.tierName
    });
  }

  async deleteTier(tier: any) {
    this.selectedTier = tier;
    const confirmed = confirm(`Are you sure you want to delete the tier "${tier.tierName}"?`);

    if (confirmed) {
      try {
        await deleteDoc(doc(this.firestore, 'service_center_service_tiers', tier.id));

        alert('Tier deleted successfully.');
        this.loadSavedTiers();
      } catch (err: any) {
        alert(err.message || 'Failed to delete tier.');
      }
    }
  }

  getYearSummary(years: any): string {
    if (!years) return 'N/A';
    const flatYears: number[] = Object.values(years || {})
      .flat()
      .map((y: any) => Number(y))
      .filter((y: number) => !isNaN(y));
    if (flatYears.length === 0) return 'N/A';
    const min = Math.min(...flatYears);
    const max = Math.max(...flatYears);
    return `${min} - ${max}`;
  }

  fetchMakes() {
    this.http
      .get<any>('https://public.opendatasoft.com/api/records/1.0/search/?dataset=all-vehicles-model&rows=100&facet=make')
      .subscribe(res => {
        this.makes = Array.from(
          new Set<string>(
            res.records
              .map((r: any) => String(r.fields.make))
              .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
          )
        ).sort();
      });
  }

  fetchModels(make: string, after?: () => void) {
    this.http.get<any>(
      `https://public.opendatasoft.com/api/records/1.0/search/?dataset=all-vehicles-model&rows=200&refine.make=${make}`
    ).subscribe(res => {
      this.modelsByMake[make] = Array.from(
        new Set<string>(
          res.records
            .map((r: any) => String(r.fields.model))
            .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
        )
      ).sort();

      after?.();
    });
  }

  fetchFiltersForModel(make: string, model: string, callback?: () => void) {
    this.http.get<any>(
      `https://public.opendatasoft.com/api/records/1.0/search/?dataset=all-vehicles-model&rows=500&refine.make=${make}&refine.model=${model}`
    ).subscribe(res => {
      this.yearsByModel[model] = Array.from(
        new Set<number>(
          res.records.map((r: any) => Number(r.fields.year))
            .filter((v: unknown): v is number => typeof v === 'number' && !isNaN(v))
        )
      ).sort((a: number, b: number) => b - a); // desc

      this.fuelTypesByModel[model] = Array.from(
        new Set<string>(
          res.records.map((r: any) => String(r.fields.fueltype))
            .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
        )
      ).sort();

      this.displacementsByModel[model] = Array.from(
        new Set<number>(
          res.records.map((r: any) => Number(r.fields.displ))
            .filter((v: unknown): v is number => typeof v === 'number' && !isNaN(v))
        )
      ).sort((a: number, b: number) => b - a);

      this.sizeClassesByModel[model] = Array.from(
        new Set<string>(
          res.records.map((r: any) => String(r.fields.vclass))
            .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
        )
      ).sort();

      // declaring the selected models's fuel type button
      if (!this.fuelTypesByModel[make]) {
        this.fuelTypesByModel[make] = [];
      }
      this.fuelTypesByModel[make] = Array.from(new Set([
        ...this.fuelTypesByModel[make],
        ...this.fuelTypesByModel[model]
      ]));

      // declaring the selected models's displacement button
      if (!this.displacementsByModel[make]) {
        this.displacementsByModel[make] = [];
      }
      this.displacementsByModel[make] = Array.from(new Set([
        ...this.displacementsByModel[make],
        ...this.displacementsByModel[model]
      ]));

      // declaring the selected models's sizeClasses button
      if (!this.sizeClassesByModel[make]) {
        this.sizeClassesByModel[make] = [];
      }
      this.sizeClassesByModel[make] = Array.from(new Set([
        ...this.sizeClassesByModel[make],
        ...this.sizeClassesByModel[model]
      ]));

      if (callback) {
        callback();
      }
    });
  }

  onMakeToggle(make: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;

    if (checked) {
      if (!this.selectedMakes.includes(make)) {
        this.selectedMakes.push(make);
      }
      this.expandMake[make] = true;

      if (!this.modelsByMake[make]) {
        this.fetchModels(make, () => {
          (this.modelsByMake[make] || []).forEach(model => {
            this.fetchFiltersForModel(make, model, () => {
              if (!this.selectedFuelTypes[model]) this.selectedFuelTypes[model] = [];
              if (!this.selectedDisplacements[model]) this.selectedDisplacements[model] = [];
              if (!this.selectedSizeClasses[model]) this.selectedSizeClasses[model] = [];
            });
          });
        });
      }
    } else {
      // unchecking make
      this.selectedMakes = this.selectedMakes.filter(m => m !== make);
      delete this.modelsByMake[make];
      delete this.selectedModels[make];
    }
  }

  selectAllMakes() {
    this.selectedMakes = [...this.makes];
    this.selectedMakes.forEach(mk => {
      this.expandMake[mk] = true;
      if (!this.modelsByMake[mk]) {
        this.fetchModels(mk);
      }
    });
  }

  clearAllMakes() {
    this.selectedMakes = [];
    this.selectedModels = {};
    this.yearsByModel = {};
    this.fuelTypesByModel = {};
    this.displacementsByModel = {};
    this.sizeClassesByModel = {};
    this.selectedYears = {};
    this.selectedFuelTypes = {};
    this.selectedDisplacements = {};
    this.selectedSizeClasses = {};
  }

  toggleMakePanel(make: string) {
    this.expandMake[make] = !this.expandMake[make];

    if (!this.yearRangeForMake[make]) {
      this.yearRangeForMake[make] = { start: undefined, end: undefined };
    }
  }

  toggleModel(make: string, model: string) {
    if (!this.selectedModels[make]) {
      this.selectedModels[make] = [];
    }

    const index = this.selectedModels[make].indexOf(model);
    if (index >= 0) {
      this.selectedModels[make].splice(index, 1);
      this.clearModelFilters(model);
    } else {
      this.selectedModels[make].push(model);
      // fetch once on select
      if (!this.yearsByModel[model]) {
        this.fetchFiltersForModel(make, model);
      }
      this.expandModel[model] = false; // collapsed by default
    }
  }

  isModelSelected(make: string, model: string) {
    return !!this.selectedModels[make]?.includes(model);
  }

  selectAllModels(make: string) {
    if (!this.modelsByMake[make]) return;
    if (!this.selectedModels[make]) {
      this.selectedModels[make] = [];
    }
    const toAdd = this.modelsByMake[make].filter(m => !this.selectedModels[make].includes(m));
    this.selectedModels[make].push(...toAdd);
    toAdd.forEach(model => {
      if (!this.yearsByModel[model]) {
        this.fetchFiltersForModel(make, model);
      }
    });
  }

  clearAllModels(make: string) {
    (this.selectedModels[make] || []).forEach(m => this.clearModelFilters(m));
    delete this.selectedModels[make];
  }

  // filtered model for search box
  getFilteredModels(make: string): string[] {
    const list = this.modelsByMake[make] || [];
    const searchInput = (this.modelSearch[make] || '').trim().toLowerCase();
    if (!searchInput) {
      return list;
    }
    return list.filter(m => m.toLowerCase().includes(searchInput));
  }

  selectFilteredModels(make: string) {
    const filtered = this.getFilteredModels(make);
    if (!this.selectedModels[make]) {
      this.selectedModels[make] = [];
    }
    filtered.forEach(model => {
      if (!this.selectedModels[make].includes(model)) {
        this.selectedModels[make].push(model);
        if (!this.yearsByModel[model]) {
          this.fetchFiltersForModel(make, model);
        }
      }
    });
  }

  getFilteredFuelTypes(make: string): string[] {
    const models = this.getFilteredModels(make);
    const fuelSet = new Set<string>();

    models.forEach(model => {
      const fuels = this.fuelTypesByModel[model];
      if (fuels) {
        fuels.forEach(f => fuelSet.add(f));
      }
    });

    return Array.from(fuelSet).sort();
  }

  getFilteredDisplacements(make: string): number[] {
    const models = this.getFilteredModels(make);
    const displacementSet = new Set<number>();

    models.forEach(model => {
      const disps = this.displacementsByModel[model];
      if (disps) {
        disps.forEach(d => displacementSet.add(d));
      }
    });

    return Array.from(displacementSet).sort();
  }

  getFilteredSizeClasses(make: string): string[] {
    const models = this.getFilteredModels(make);
    const sizeSet = new Set<string>();

    models.forEach(model => {
      const sizes = this.sizeClassesByModel[model];
      if (sizes) {
        sizes.forEach(s => sizeSet.add(s));
      }
    });

    return Array.from(sizeSet).sort();
  }

  clearFilteredModels(make: string) {
    const filtered = new Set(this.getFilteredModels(make));
    if (!this.selectedModels[make]) return;
    this.selectedModels[make] = this.selectedModels[make].filter(m => {
      const remove = filtered.has(m);
      if (remove) this.clearModelFilters(m);
      return !remove;
    });
  }

  toggleModelPanel(model: string) {
    this.expandModel[model] = !this.expandModel[model];
  }

  clearModelFilters(model: string) {
    delete this.yearsByModel[model];

    // commented it due to currently wanted to remain the filters of these 3 when click on clear filters
    // delete this.fuelTypesByModel[model];
    // delete this.displacementsByModel[model];
    // delete this.sizeClassesByModel[model];
    delete this.selectedYears[model];
    delete this.selectedFuelTypes[model];
    delete this.selectedDisplacements[model];
    delete this.selectedSizeClasses[model];
    delete this.expandModel[model];
  }

  toggleYear(model: string, y: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!this.selectedYears[model]) {
      this.selectedYears[model] = [];
    }
    if (checked) {
      if (!this.selectedYears[model].includes(y)) {
        this.selectedYears[model].push(y);
      }
    } else {
      this.selectedYears[model] = this.selectedYears[model].filter(v => v !== y);
    }
  }

  selectAllYears(model: string) {
    if (this.yearsByModel[model]) {
      this.selectedYears[model] = [...this.yearsByModel[model]];
    }
  }

  clearYears(model: string) {
    this.selectedYears[model] = [];
  }

  applyYearPreset(model: string, preset: YearPreset) {
    const all = this.yearsByModel[model] || [];
    let picked: number[] = [];
    switch (preset) {
      case 'latest5': picked = all.slice(0, 5); break; // years sorted desc
      case 'all': picked = [...all]; break
    }
    this.selectedYears[model] = picked;
  }

  applyYearRange(model: string, start?: number | null, end?: number | null) {
    if (!start || !end) return;
    const all = this.yearsByModel[model] || [];
    this.selectedYears[model] = all.filter(y => y >= start && y <= end);
  }

  // brand-wide applies to all selected models of that car make
  applyYearPresetToMake(make: string, preset: YearPreset) {
    (this.selectedModels[make] || []).forEach(model => {
      const run = () => this.applyYearPreset(model, preset);
      if (this.yearsByModel[model]?.length) run();
      else this.fetchFiltersForModel(make, model, run);
    });
  }

  // showing a list of the available fuel types button for a make
  applyFuelTypeToMake(make: string, fuel: string) {
    (this.selectedModels[make] || []).forEach(model => {
      const run = () => {
        if (this.fuelTypesByModel[model]?.includes(fuel)) {
          if (!this.selectedFuelTypes[model]) {
            this.selectedFuelTypes[model] = [];
          }
          if (!this.selectedFuelTypes[model].includes(fuel)) {
            this.selectedFuelTypes[model].push(fuel);
          }
        };
      };
      if (this.fuelTypesByModel[model]?.length) {
        run();
      } else {
        this.fetchFiltersForModel(make, model, run);
      }
    });
  }

  // showing a list of the available displacements button for a make
  applyDisplacementToMake(make: string, disp: number) {
    (this.selectedModels[make] || []).forEach(model => {
      const run = () => {
        if (this.displacementsByModel[model]?.includes(disp)) {
          if (!this.selectedDisplacements[model]) {
            this.selectedDisplacements[model] = [];
          }
          if (!this.selectedDisplacements[model].includes(disp)) {
            this.selectedDisplacements[model].push(disp);
          }
        };
      };
      if (this.displacementsByModel[model]?.length) {
        run();
      } else {
        this.fetchFiltersForModel(make, model, run);
      }
    });
  }

  // showing a list of the available size classes button for a make
  applySizeClassToMake(make: string, size: string) {
    (this.selectedModels[make] || []).forEach(model => {
      const run = () => {
        if (this.sizeClassesByModel[model]?.includes(size)) {
          if (!this.selectedSizeClasses[model]) {
            this.selectedSizeClasses[model] = [];
          }
          if (!this.selectedSizeClasses[model].includes(size)) {
            this.selectedSizeClasses[model].push(size);
          }
        };
      };
      if (this.sizeClassesByModel[model]?.length) {
        run();
      } else {
        this.fetchFiltersForModel(make, model, run);
      }
    });
  }

  toggleFuel(model: string, f: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!this.selectedFuelTypes[model]) {
      this.selectedFuelTypes[model] = [];
    }
    if (checked && !this.selectedFuelTypes[model].includes(f)) {
      this.selectedFuelTypes[model].push(f);
    } else if (!checked) {
      this.selectedFuelTypes[model] = this.selectedFuelTypes[model].filter(v => v !== f);
    }
  }

  toggleDisplacement(model: string, d: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!this.selectedDisplacements[model]) {
      this.selectedDisplacements[model] = [];
    }
    if (checked && !this.selectedDisplacements[model].includes(d)) {
      this.selectedDisplacements[model].push(d);
    } else if (!checked) {
      this.selectedDisplacements[model] = this.selectedDisplacements[model].filter(v => v !== d);
    }
  }

  toggleSize(model: string, s: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!this.selectedSizeClasses[model]) {
      this.selectedSizeClasses[model] = [];
    }
    if (checked && !this.selectedSizeClasses[model].includes(s)) {
      this.selectedSizeClasses[model].push(s);
    } else if (!checked) {
      this.selectedSizeClasses[model] = this.selectedSizeClasses[model].filter(v => v !== s);
    }
  }

  async saveTier() {
    if (this.tierForm.invalid || this.selectedMakes.length === 0) {
      this.errorMessage = 'Please fill required fields and select cars';
      return;
    }

    const filteredFuelTypes = Object.fromEntries(
      Object.entries(this.selectedFuelTypes).filter(([make, fuels]) => Array.isArray(fuels) && fuels.length > 0)
    );

    const filteredDisplacements = Object.fromEntries(
      Object.entries(this.selectedDisplacements).filter(([make, disps]) => Array.isArray(disps) && disps.length > 0)
    );

    const filteredSizeClasses = Object.fromEntries(
      Object.entries(this.selectedSizeClasses).filter(([make, sizes]) => Array.isArray(sizes) && sizes.length > 0)
    );

    const data = {
      ...this.tierForm.value,
      serviceCenterId: this.serviceCenterId,
      makes: this.selectedMakes,
      models: this.selectedModels,
      years: this.selectedYears,
      fuelTypes: filteredFuelTypes,
      displacements: filteredDisplacements,
      sizeClasses: filteredSizeClasses
    };

    try {
      await addDoc(collection(this.firestore, 'service_center_service_tiers'), data);
      alert('Tier saved successfully!');
      this.errorMessage = '';
      this.tierForm.reset({ serviceCenterId: this.serviceCenterId });
      this.clearAllMakes();
      this.loadSavedTiers();
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to save tier';
    }
  }

  // fitments of make model and year filter
  trackByMake = (_: number, make: string) => make;
  trackByModel = (_: number, model: string) => model;
  trackByYear = (_: number, y: number) => y;
}
