import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, getDocs, getDoc, where, query, deleteDoc, doc, setDoc, serverTimestamp, updateDoc, orderBy } from '@angular/fire/firestore';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth/service-center-auth';
import { Modal } from 'bootstrap';
import { Observable } from 'rxjs';

// define on the presets year range
type YearPreset = 'latest5' | 'all';

// define service offer that stored in db
interface ServiceOffer {
  id: string;
  serviceCenterId: string;
  servicePackageId?: string | null;
  categoryId?: string | null;
  serviceId?: string | null;
  tierId?: string | null;
  makes: string[];
  models: Record<string, string[]>; // for supporting in a grouped data
  years: Record<string, string[]>;
  fuelTypes: Record<string, string[]>;
  displacements: Record<string, number[]>;
  sizeClasses: Record<string, string[]>;
  duration: number;
  partPrice: number | null,
  partPriceMin: number | null,
  partPriceMax: number | null,
  labourPrice: number | null,
  labourPriceMin: number | null,
  labourPriceMax: number | null,
  serviceDescription: string | null,
  active: boolean;
  updatedAt: any;
  createdAt: any;
}

// define tier that stored in db
interface Tier {
  id: string;
  tierName: string;
  serviceCenterId: string;
  makes: string[];
  models: Record<string, string[]>;
  years: Record<string, string[]>;
  fuelTypes: Record<string, string[]>;
  displacements: Record<string, number[]>;
  sizeClasses: Record<string, string[]>;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  duration?: number;
}

// define fitment information if no tier is linked
interface CarFitments {
  makes: string[];
  models: Record<string, string[]>;
  years: Record<string, string[]>;
  fuelTypes: Record<string, string[]>;
  displacements: Record<string, number[]>;
  sizeClasses: Record<string, string[]>;
}

// for showing the relavent service offer data
interface EnrichedServiceOffer extends ServiceOffer {
  service?: { id: string; name: string;[key: string]: any };
  category?: { id: string; name: string;[key: string]: any };
  package?: { id: string; name: string;[key: string]: any };
  serviceOfferId?: string;
  tier?: Tier;
  carFitments?: CarFitments;
}

interface VehicleRequest {
  id: string;
  make: string;
  model: VehicleModel[];
  serviceCenterId: string;
  serviceCenterName: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  requestedAt: Date;
}

interface Fitment {
  year: string;
  fuel: string;
  displacement: string[] | string; // allow array or string
  sizeClass: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface VehicleModel {
  name: string;
  fitments: Fitment[];
}

export interface ServicePackage {
  id?: string;
  name: string;
  description?: string;
  services: PackageService[];
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
}

export interface PackageService {
  serviceId: string;
  serviceName: string;
  categoryId?: string;
  categoryName?: string;
}

export interface Category {
  id?: string;
  name: string;
  description?: string;
  active: boolean;
  status?: string;
  createdBy?: string;
  createdAt?: any;
}

@Component({
  selector: 'app-manage-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, FormsModule],
  styleUrls: ['./manage-services.component.css'],
  templateUrl: './manage-services.component.html'
})

export class ServiceCenterServiceComponent implements OnInit {
  Object = Object;
  // all service offers by the service center
  serviceOffers: EnrichedServiceOffer[] = [];
  filteredOffers: EnrichedServiceOffer[] = [];
  serviceDescription: string = '';
  error = '';

  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  //declare tab
  tab: 'service' | 'tier' | 'requestService' | 'setupPackage' | 'newVehicleRequestList' = 'service';
  serviceCenterId!: string;
  serviceCenterName!: string;
  viewCategories: any[] = [];
  filteredCategories: any[] = [];
  offeredCategories: any[] = [];

  // request new vehicle attributes
  requestOtherMakeSelectedInService = false;
  requestOtherMakeSelectedInTier = false;
  newMakeRequest: string = '';
  newModels: any[] = [];
  vehicles: any[] = [];

  searchInput: string = '';
  filterPackage: string = '';
  filterCategory: string = '';
  filterService: string = '';
  filterStatus: string = '';
  filterMake: string = '';
  filterYear: string = '';
  filterFuelType: string = '';
  filterDisplacement: string = '';
  filterSizeClass: string = '';

  allPackages: string[] = [];
  allCategories: string[] = [];
  allServices: string[] = [];
  allMakes: string[] = [];
  allModels: string[] = [];
  allYears: number[] = [];
  allFuelTypes: string[] = [];
  allDisplacements: number[] = [];
  allSizeClasses: string[] = [];

  // pagination
  pageSize = 10;
  serviceRequestPageSize = 5;
  categoryRequestPageSize = 5;
  currentPage = 1;
  currentPageCategories = 1;
  currentPageServices = 1;

  // expand / edit
  expanded: Record<string, boolean> = {};
  editingOfferId: string | null = null;
  editBuffer: {
    partPriceType?: 'none' | 'fixed' | 'range';
    partPrice?: number | null;
    partPriceMin?: number | null;
    partPriceMax?: number | null;
    labourPriceType?: 'none' | 'fixed' | 'range';
    labourPrice?: number | null;
    labourPriceMin?: number | null;
    labourPriceMax?: number | null;
    serviceDescription?: string | null;
    duration?: number
  } = {};

  // tab services and category from firestore
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
  info = '';
  brandWideDisabledSvc = false;

  // pick from Category to Service to Tier
  pick = {
    packageId: '',
    categoryId: '',
    serviceId: '',
    tierId: ''
  };

  pricing = {
    partPriceType: 'fixed' as 'fixed' | 'range' | 'none',
    partPrice: null as number | null,
    partPriceMin: null as number | null,
    partPriceMax: null as number | null,
    labourPriceType: 'fixed' as 'fixed' | 'range' | 'none',
    labourPrice: null as number | null,
    labourPriceMin: null as number | null,
    labourPriceMax: null as number | null,
    duration: null as number | null
  };

  // tab tiers from firestore
  tierForm!: FormGroup;
  savedTiers: any[] = [];
  selectedTier: any = null;
  selectedTierId: string = '';
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

  // tab request new category or service
  categories$!: Observable<Category[]>;
  newCategoryName: string = '';
  newCategoryDescription: string = '';
  newServiceName: string = '';
  newServiceDescription: string = '';
  selectedCategoryId: string = '';
  newServiceCategoriesRequests: any[] = [];
  newServicesRequests: any[] = [];

  // tab setup package
  savedPackages: ServicePackage[] = [];
  packageForm = {
    name: '',
    description: '',
    services: [] as { categoryId: string, categoryName: string, serviceId: string, serviceName: string }[]
  };
  packagePick: { categoryId: string; serviceId: string } = { categoryId: '', serviceId: '' }; // for temporary dropdown selection
  editingPackageId: string | null = null;
  editDescription: string = '';


  // tab new vehicle requests
  pendingRequests: VehicleRequest[] = [];


  loading = false;
  errorMessage = '';
  infoMessage = '';
  requestCatLoading = false;
  requestSvcLoading = false;
  savePackageLoading = false;
  loadingSavedPackages = false;

  ngOnInit() {
    this.serviceCenterId = this.auth.getServiceCenterId();
    this.serviceCenterName = this.auth.getServiceCenterName();
    this.tierForm = this.fb.group({
      tierName: ['', Validators.required],
    });
    this.initServiceTab();
    this.loadServiceOffered();
    this.fetchFuelTypes();
    this.fetchSizeClasses();

    this.loadSavedTiers();
    this.fetchMakes();

    this.loadSavedPackages();
    this.loadServiceCategoriesRequests();
    this.loadServicesRequests();
    this.loadVehiclesRequests();
  }

  async initServiceTab() {
    this.loading = true;
    const categorySnapshot = await getDocs(query(collection(this.firestore, 'services_categories'), where('active', '==', true), where('status', '==', 'approved')));
    this.categories = categorySnapshot.docs.map(category => ({ id: category.id, ...category.data() }));

    // preload services which grouped by category
    this.servicesByCategory = {};
    for (const category of this.categories) {
      const serviceSnapshot = await getDocs(
        query(
          collection(this.firestore, 'services'),
          where('categoryId', '==', category['id']),
          where('active', '==', true),
          where('status', '==', 'approved')
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

  async getServiceOfferDescription() {
    const descSnap = await getDocs(
      query(collection(this.firestore, 'services'), where('id', '==', this.pick.serviceId))
    );

    let description = descSnap.docs[0]?.data()?.['description'] || '';

    const selectedService = this.servicesByCategory[this.pick.categoryId]
      ?.find(s => s.id === this.pick.serviceId);

    if (selectedService?.description) {
      description = selectedService.description;
    }

    this.serviceDescription = description;
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

        if (offer.servicePackageId) {
          const packageRef = collection(this.firestore, 'service_packages');
          const q = query(
            packageRef,
            where('__name__', '==', offer.servicePackageId),
            where('active', '==', true),
          );

          const packageSnap = await getDocs(q);
          if (!packageSnap.empty) {
            const docSnap = packageSnap.docs[0];
            const data = docSnap.data() as { name: string;[key: string]: any };
            enrichedOffer.package = { id: docSnap.id, ...data };
          }
        }

        // Related service
        if (offer.serviceId) {
          const serviceRef = collection(this.firestore, 'services');
          const q = query(
            serviceRef,
            where('__name__', '==', offer.serviceId),
            where('active', '==', true),
            where('status', '==', 'approved')
          );

          const serviceSnap = await getDocs(q);
          if (!serviceSnap.empty) {
            const docSnap = serviceSnap.docs[0];
            const data = docSnap.data() as { name: string;[key: string]: any };
            enrichedOffer.service = { id: docSnap.id, ...data };
          }
        }

        // Related category
        if (offer.categoryId && typeof offer.categoryId === 'string' && offer.categoryId.trim() !== '') {

          const categoryRef = collection(this.firestore, 'services_categories');
          const q = query(
            categoryRef,
            where('__name__', '==', offer.categoryId),
            where('active', '==', true),
            where('status', '==', 'approved')
          );
          const categorySnap = await getDocs(q);

          if (!categorySnap.empty) {
            const docSnap = categorySnap.docs[0];
            const data = docSnap.data() as { name: string;[key: string]: any };
            enrichedOffer.category = { id: docSnap.id, ...data };
          }
        }

        // Related tier
        if (offer.tierId && typeof offer.tierId === 'string' && offer.tierId.trim() !== '') {
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

      // collect distinct filters
      const packagesSet = new Set<string>();
      const categoriesSet = new Set<string>();
      const servicesSet = new Set<string>();
      const makesSet = new Set<string>();
      const modelsSet = new Set<string>();
      const yearsSet = new Set<number>();

      this.serviceOffers.forEach(offer => {
        const tier = offer.tier;
        const fit = offer.carFitments;

        // collect makes
        if (tier?.models) Object.keys(tier.models).forEach(make => makesSet.add(make));
        if (fit?.makes) fit.makes.forEach(make => makesSet.add(make));

        // collect years
        if (tier?.years) {
          Object.values(tier.years).forEach(years => years.forEach(y => yearsSet.add(Number(y))));
        }
        if (fit?.years) {
          Object.values(fit.years).forEach(years => years.forEach(y => yearsSet.add(Number(y))));
        }

        if (offer.package) {
          packagesSet.add(offer.package.name);
        }

        if (offer.category) {
          categoriesSet.add(offer.category.name);
        }

        if (offer.service) {
          servicesSet.add(offer.service.name);
        }

      });

      // Convert to arrays and sort for filtering service offer data
      this.allMakes = Array.from(makesSet).sort();
      this.allPackages = Array.from(packagesSet).sort();
      this.allCategories = Array.from(categoriesSet).sort();
      this.allServices = Array.from(servicesSet).sort();
      this.allModels = Array.from(modelsSet).sort();
      this.allYears = Array.from(yearsSet).sort((a, b) => b - a);


    } catch (err: any) {
      this.error = err.message || 'Failed to load service offers';
    } finally {
      this.loading = false;
      this.applyFilters();
    }
  }

  showsSpecificSvcOfferFitmentsArr(fit: any) {
    const allModelsSvcOffer = [...new Set(Object.values(fit.models || {}).flat() as string[])];
    const allYearsSvcOffer = [...new Set(Object.values(fit.years || {}).flat().toString().split(',').map(v => parseInt(v)))];
    const allFuelTypesSvcOffer = [...new Set(Object.values(fit.fuelTypes || {}).flat())];
    const allDisplacementsSvcOffer = [...new Set(Object.values(fit.displacements || {}).flat().toString().split(',').map(v => parseFloat(v)))];
    const allSizeClassesSvcOffer = [...new Set(Object.values(fit.sizeClasses || {}).flat())];

    return {
      allModelsSvcOffer: Array.from(allModelsSvcOffer).sort(),
      allYearsSvcOffer: Array.from(allYearsSvcOffer).sort((a, b) => b - a),
      allFuelTypesSvcOffer: Array.from(allFuelTypesSvcOffer).sort(),
      allDisplacementsSvcOffer: Array.from(allDisplacementsSvcOffer).map(v => parseFloat(v as any)).sort((a, b) => a - b),
      allSizeClassesSvcOffer: Array.from(allSizeClassesSvcOffer).sort()
    };
  }

  applyFilters() {
    const term = (this.searchInput || '').trim().toLowerCase();

    this.filteredOffers = this.serviceOffers.filter(offer => {

      // search by service name, category, make, model
      const matchesSearch = !term || (
        (offer.service?.name || '').toLowerCase().includes(term) ||
        (offer.category?.name || '').toLowerCase().includes(term) ||
        offer.tier?.makes?.some(m => m.toLowerCase().includes(term)) ||
        Object.keys(offer.tier?.models || {}).some(model =>
          offer.tier?.models[model]?.some(m => m.toLowerCase().includes(term))
        ) ||
        offer.carFitments?.makes?.some(m => m.toLowerCase().includes(term)) ||
        Object.keys(offer.carFitments?.models || {}).some(make =>
          make.toLowerCase().includes(term) ||
          offer.carFitments?.models[make]?.some(m => m.toLowerCase().includes(term))
        )
      );

      const matchesPackage = !this.filterPackage || (
        (offer.package?.name || '').toLowerCase().includes(this.filterPackage.toLowerCase())
      );

      const matchesMake = !this.filterMake || (
        (offer.tier?.makes || []).includes(this.filterMake) ||
        (offer.carFitments?.makes || []).includes(this.filterMake)
      );

      const matchesCategory = !this.filterCategory || (
        (offer.category?.name || '').toLowerCase().includes(this.filterCategory.toLowerCase())
      );

      const matchesService = !this.filterService || (
        (offer.service?.name || '').toLowerCase().includes(this.filterService.toLowerCase())
      );

      const matchesStatus = !this.filterStatus || (
        (offer?.active === (this.filterStatus === 'true'))
      );

      const matchesYear = !this.filterYear || this.matchesYearFilter(offer, this.filterYear);

      return matchesSearch && matchesPackage && matchesCategory && matchesMake && matchesService && matchesStatus && matchesYear;
    });

    this.currentPage = 1;
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

  get pagedOffers(): EnrichedServiceOffer[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredOffers.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredOffers.length / this.pageSize));
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages) return;
    this.currentPage = p;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getYearValues(value: unknown): string {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return '';
  }

  toggleExpand(id?: string) {
    if (!id) {
      return console.log("Toggling expand for:", id);
    }
    this.expanded[id] = !this.expanded[id];
  }

  startEdit(offer: EnrichedServiceOffer) {
    const offerId = offer.serviceOfferId ?? offer.id;
    this.editingOfferId = offerId;
    // copy current values into edit buffer
    this.editBuffer = {
      partPriceType: offer.partPrice != null ? 'fixed' : (offer.labourPriceMin != null || offer.labourPriceMax != null ? 'range' : 'none'),
      partPrice: offer.partPrice ?? null,
      partPriceMin: offer.partPriceMin ?? null,
      partPriceMax: offer.partPriceMax ?? null,
      labourPriceType: offer.labourPrice != null ? 'fixed' : (offer.labourPriceMin != null || offer.labourPriceMax != null ? 'range' : 'none'),
      labourPrice: offer.labourPrice ?? null,
      labourPriceMin: offer.labourPriceMin ?? null,
      labourPriceMax: offer.labourPriceMax ?? null,
      serviceDescription: offer.serviceDescription ?? null,
      duration: offer.duration
    };
  }

  cancelEdit() {
    this.editingOfferId = null;
    this.editBuffer = {};
    this.info = '';
    this.error = '';
  }

  // for updating the service offer price type
  onPartPriceTypeChange(type: 'fixed' | 'range' | 'none') {
    this.editBuffer.partPriceType = type;

    if (type === 'fixed') {
      this.editBuffer.partPriceMin = null;
      this.editBuffer.partPriceMax = null;
    } else if (type === 'range') {
      this.editBuffer.partPrice = null;
    } else {
      this.editBuffer.partPriceMin = null;
      this.editBuffer.partPriceMax = null;
      this.editBuffer.partPrice = 0;
    }
  }

  onLabourPriceTypeChange(type: 'fixed' | 'range' | 'none') {
    this.editBuffer.labourPriceType = type;

    if (type === 'fixed') {
      this.editBuffer.labourPriceMin = null;
      this.editBuffer.labourPriceMax = null;
    } else if (type === 'range') {
      this.editBuffer.labourPrice = null;
    } else {
      this.editBuffer.labourPriceMin = null;
      this.editBuffer.labourPriceMax = null;
      this.editBuffer.labourPrice = 0;
    }
  }

  async saveEdit(offer: EnrichedServiceOffer) {
    if (!this.editingOfferId) return;
    try {
      const offerId = offer.serviceOfferId ?? offer.id;
      this.info = '';
      this.error = '';

      if (!this.editBuffer.duration || this.editBuffer.duration < 5) {
        this.error = 'Please enter a valid duration (at least 5 mins).';
        return;
      }
      if (this.editBuffer.partPrice == null && (this.editBuffer.partPriceMin == null || this.editBuffer.partPriceMax == null)) {
        this.error = 'Please provide a price (fixed) or price range.';
        return;
      }
      if (this.editBuffer.partPriceType === 'fixed' && this.editBuffer.partPrice != null && this.editBuffer.partPrice < 0) {
        this.error = 'Price cannot less then RM0.'; return;
      }
      if (this.editBuffer.partPriceType === 'range' && (!this.editBuffer.partPriceMin || !this.editBuffer.partPriceMax || this.editBuffer.partPriceMin >= this.editBuffer.partPriceMax)) {
        this.error = 'Please enter a valid price range (min < max).'; return;
      }
      if (this.editBuffer.labourPrice == null && (this.editBuffer.labourPriceMin == null || this.editBuffer.labourPriceMax == null)) {
        this.error = 'Please provide a price (fixed) or price range.';
        return;
      }
      if (this.editBuffer.labourPriceType === 'fixed' && this.editBuffer.labourPrice != null && this.editBuffer.labourPrice < 0) {
        this.error = 'Price cannot less then RM0.'; return;
      }
      if (this.editBuffer.labourPriceType === 'range' && (!this.editBuffer.labourPriceMin || !this.editBuffer.labourPriceMax || this.editBuffer.labourPriceMin >= this.editBuffer.labourPriceMax)) {
        this.error = 'Please enter a valid price range (min < max).'; return;
      }

      if (this.editBuffer.serviceDescription == '' || this.editBuffer.serviceDescription == null) {
        this.error = 'Please provide a service offer description.';
        return;
      }

      // update the service offer details
      const updatePayload: any = {
        duration: this.editBuffer.duration
      };

      if (this.editBuffer.partPriceType === 'fixed') {
        updatePayload.partPrice = this.editBuffer.partPrice ?? 0;
        updatePayload.partPriceMin = null;
        updatePayload.partPriceMax = null;
      } else if (this.editBuffer.partPriceType === 'range') {
        updatePayload.partPrice = null;
        updatePayload.partPriceMin = this.editBuffer.partPriceMin ?? 0;
        updatePayload.partPriceMax = this.editBuffer.partPriceMax ?? 0;
      } else {
        updatePayload.partPrice = 0;
        updatePayload.partPriceMin = null;
        updatePayload.partPriceMax = null;
      }

      if (this.editBuffer.labourPriceType === 'fixed') {
        updatePayload.labourPrice = this.editBuffer.labourPrice ?? 0;
        updatePayload.labourPriceMin = null;
        updatePayload.labourPriceMax = null;
      } else if (this.editBuffer.labourPriceType === 'range') {
        updatePayload.labourPrice = null;
        updatePayload.labourPriceMin = this.editBuffer.labourPriceMin ?? 0;
        updatePayload.labourPriceMax = this.editBuffer.labourPriceMax ?? 0;
      } else {
        updatePayload.labourPrice = 0;
        updatePayload.labourPriceMin = null;
        updatePayload.labourPriceMax = null;
      }

      if (this.editBuffer.serviceDescription != null) {
        updatePayload.serviceDescription = this.editBuffer.serviceDescription;
      }

      await setDoc(
        doc(this.firestore, 'service_center_services_offer', offerId),
        updatePayload,
        { merge: true }
      );
      // update current screen to reflect immediately
      offer.duration = updatePayload.duration;
      offer.partPrice = updatePayload.partPrice;
      offer.partPriceMin = updatePayload.partPriceMin;
      offer.partPriceMax = updatePayload.partPriceMax;
      offer.labourPrice = updatePayload.labourPrice;
      offer.labourPriceMin = updatePayload.labourPriceMin;
      offer.labourPriceMax = updatePayload.labourPriceMax;
      offer.serviceDescription = updatePayload.serviceDescription ?? offer.serviceDescription;

      this.info = 'Offer updated';
      this.cancelEdit();
    } catch (err: any) {
      console.error(err);
      this.error = err?.message || 'Failed to update offer';
    }
  }

  async toggleActive(offer: EnrichedServiceOffer) {
    const offerId = offer.serviceOfferId ?? offer.id;
    try {
      const newStatus = !(offer.active ?? true);
      await setDoc(doc(this.firestore, 'service_center_services_offer', offerId), { active: newStatus }, { merge: true });
      offer.active = newStatus;
    } catch (err: any) {
      console.error(err);
      this.svcError = err?.message || 'Failed to update status';
    }
  }

  async deleteOffer(offer: EnrichedServiceOffer) {
    const offerId = offer.serviceOfferId ?? offer.id;
    if (!confirm(`Delete service offer "${offer.service?.name || offer.serviceOfferId}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(this.firestore, 'service_center_services_offer', offerId));
      // remove locally
      this.serviceOffers = this.serviceOffers.filter(o => o.serviceOfferId !== offer.serviceOfferId);
      this.info = 'Offer deleted';
      this.applyFilters();
    } catch (err: any) {
      console.error(err);
      this.svcError = err?.message || 'Failed to delete offer';
    }
  }

  formatPrice(offer: ServiceOffer, type: 'part' | 'labour'): string {
    const price = offer[`${type}Price`];
    const min = offer[`${type}PriceMin`];
    const max = offer[`${type}PriceMax`];

    if (price != null && price !== 0) return price.toString();
    if (min != null && max != null) return `${min} - ${max}`;
    return '0';
  }

  resetFilters() {
    this.searchInput = '';
    this.filterMake = '';
    this.filterYear = '';
    this.applyFilters();
  }

  async onPickPackage() {
    if (this.pick.packageId) {
      this.pick.categoryId = '';
      this.pick.serviceId = '';
    }
    const descSnap = await getDocs(
      query(collection(this.firestore, 'service_packages'), where('id', '==', this.pick.packageId))
    );

    let description = descSnap.docs[0]?.data()?.['description'] || '';

    const selectedPackage = this.savedPackages.find(p => p.id === this.pick.packageId);

    if (selectedPackage?.description) {
      description = selectedPackage.description;
    }

    this.serviceDescription = description;
  }

  onPickCategory() {
    if (this.pick.categoryId) {
      this.pick.packageId = '';
    }
    this.pick.serviceId = '';
    this.serviceDescription = '';
  }

  private capitalizeFirstAlphabet(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private validateNewModels(): string | null {
    const currentYear = new Date().getFullYear();

    for (const [mIndex, model] of this.newModels.entries()) {
      if (!model.name.trim()) {
        return `Model ${mIndex + 1} is missing a name.`;
      }

      if (model.fitments.length === 0) {
        return `Model "${model.name}" must have at least one fitment.`;
      }

      for (const [fIndex, f] of model.fitments.entries()) {
        if (!f.year.trim()) {
          return `Fitment ${fIndex + 1} in model "${model.name}" is missing a year.`;
        } else if (isNaN(parseInt(f.year.trim()))) {
          return `Fitment ${fIndex + 1} in model "${model.name}" has an invalid year.`;
        } else if (parseInt(f.year.trim()) < 1886 || parseInt(f.year.trim()) > currentYear) {
          return `Fitment ${fIndex + 1} in model "${model.name}" has an invalid year.`;
        }

        if (!f.sharedFuel) {
          return `Fitment ${fIndex + 1} in model "${model.name}" is missing a fuel type.`;
        }

        if (!f.sharedDisplacement || (Array.isArray(f.sharedDisplacement) && f.sharedDisplacement.length === 0)) {
          return `Fitment ${fIndex + 1} in model "${model.name}" is missing a displacement.`;
        } else if (isNaN(parseFloat(f.sharedDisplacement))) {
          return `Fitment ${fIndex + 1} in model "${model.name}" has an invalid displacement.`;
        } else if (parseFloat(f.sharedDisplacement) <= 0 || parseFloat(f.sharedDisplacement) > 12.9) {
          return `Fitment ${fIndex + 1} in model "${model.name}" has an invalid displacement volume.`;
        }

        if (!f.sharedSizeClass) {
          return `Fitment ${fIndex + 1} in model "${model.name}" is missing a size class.`;
        }
      }
    }
    return null;
  }

  async submitNewVehicleAttributeRequest() {
    if (!this.newMakeRequest || this.newModels.length === 0) {
      return alert('Please enter a new make and add at least one model.');
    }

    const validationError = this.validateNewModels();
    if (validationError) {
      alert(validationError);
      return;
    }

    try {

      // Fetch all current vehicles in db
      const snapshot = await getDocs(collection(this.firestore, 'vehicles_list'));
      const existingVehicles: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const existingMake = existingVehicles.find(
        v => v.make.toLowerCase() === this.newMakeRequest.toLowerCase()
      );

      // Prepare models/fitments
      const standardizedModels = this.newModels.map(model => ({
        name: this.capitalizeFirstAlphabet(model.name),
        fitments: model.fitments.map((fit: any) => ({
          year: fit.year,
          fuel: fit.sharedFuel || model.sharedFuel,
          displacement: fit.sharedDisplacement || model.sharedDisplacement,
          sizeClass: fit.sharedSizeClass || model.sharedSizeClass,
          status: 'pending'
        }))
      }));

      let filteredModels = [...standardizedModels];

      if (existingMake) {
        // Filter out models/fitments already in db
        filteredModels = standardizedModels.map(m => {
          const existingModel = existingMake.model.find(
            (em: any) => em.name.toLowerCase() === m.name.toLowerCase()
          );

          if (!existingModel) return m; // whole model is new

          const newFitments = m.fitments.filter((f: any) => {
            const key = `${f.year}-${f.fuel}-${f.displacement}-${f.sizeClass}`;
            return !existingModel.fitments.some(
              (ef: any) =>
                `${ef.year}-${ef.fuel}-${ef.displacement}-${ef.sizeClass}` === key
            );
          });

          return { ...m, fitments: newFitments };
        }).filter(m => m.fitments.length > 0);
      }

      if (filteredModels.length === 0) {
        alert(`All of your request for "${this.newMakeRequest}" already exists in the vehicle list.`);
        return;
      }

      // Save filtered request into requests collection
      const carRequestsRef = collection(this.firestore, 'vehicle_attribute_requests');
      await addDoc(carRequestsRef, {
        make: this.capitalizeFirstAlphabet(this.newMakeRequest),
        model: filteredModels,
        serviceCenterId: this.serviceCenterId,
        serviceCenterName: this.serviceCenterName,
        status: 'pending',
        requestedAt: new Date()
      });

      alert(
        `Your request for "${this.newMakeRequest}" has been submitted for admin approval (only new models/fitments included).`
      );

      this.loadVehiclesRequests();
      // Reset
      this.requestOtherMakeSelectedInService = false;
      this.requestOtherMakeSelectedInTier = false;
      this.newMakeRequest = '';
      this.newModels = [];
    } catch (err: any) {
      console.error(err);
      this.svcError = err.message || 'Failed to request new vehicle attribute';
    }
  }

  addModel() {
    const exists = this.makes.find(v => v.toLowerCase() === this.newMakeRequest.toLowerCase());
    if (exists) {
      alert(`Brand "${this.newMakeRequest}" already exists in the vehicle list. You will be using the existing brand to request additions to new models.`);
    }

    this.newModels.push({
      name: '',
      fitments: [],
    });
  }

  addFitment(modelIndex: number) {
    const model = this.newModels[modelIndex];
    model.fitments.push({
      year: '',
      sharedFuel: model.sharedFuel || '',
      sharedDisplacement: model.sharedDisplacement?.length ? [...model.sharedDisplacement] : [],
      sharedSizeClass: model.sharedSizeClass || ''
    });
  }

  updateFitments(modelIndex: number) {
    const model = this.newModels[modelIndex];
    model.fitments = model.fitments.map((fit: any) => ({
      ...fit,
      sharedFuel: model.sharedFuel,
      sharedDisplacement: model.sharedDisplacement,
      sharedSizeClass: model.sharedSizeClass
    }));
  }

  removeFitment(modelIndex: number, fitmentIndex: number) {
    const model = this.newModels[modelIndex];
    model.fitments.splice(fitmentIndex, 1);
  }

  removeModel(index: number) {
    this.newModels.splice(index, 1);
  }

  onDisplacementChange(event: any, modelIndex: number, fitmentIndex?: number) {
    const inputValue = event.target.value;
    const displacementArray = inputValue
      .split(',')
      .map((v: string) => v.trim())
      .filter((v: string) => v.length > 0);

    if (fitmentIndex !== undefined) {
      this.newModels[modelIndex].fitments[fitmentIndex].displacement = displacementArray;
    } else {
      this.newModels[modelIndex].sharedDisplacement = displacementArray;
    }
  }

  applyTierToPricing() {
    if (!this.pick.tierId) return;
    const tier = this.serviceTiers.find(x => x.id === this.pick.tierId);
    if (!tier) return;
    this.pricing.partPrice = (tier.price ?? null);
    this.pricing.partPriceMin = (tier.priceMin ?? null);
    this.pricing.partPriceMax = (tier.priceMax ?? null);
    this.pricing.duration = (tier.duration ?? null);
    // choose pricing type based on fields present
    // this.pricing.partPriceType = this.pricing.partPrice != null ? 'fixed' : 'range';

    this.pricing.labourPrice = (tier.labourPrice ?? null);
    this.pricing.labourPriceMin = (tier.labourPriceMin ?? null);
    this.pricing.labourPriceMax = (tier.labourPriceMax ?? null);

    // this.pricing.labourPriceType = this.pricing.labourPrice != null ? 'fixed' : 'range';
  }

  onPartPricingTypeChange() {
    if (this.pricing.partPriceType === 'fixed') {
      this.pricing.partPriceMin = this.pricing.partPriceMax = null;
    } else if (this.pricing.partPriceType === 'range') {
      this.pricing.partPrice = null;
    } else {
      this.pricing.partPrice = 0;
      this.pricing.partPriceMin = 0;
      this.pricing.partPriceMax = 0;
    }
  }

  onLabourPricingTypeChange() {
    if (this.pricing.labourPriceType === 'fixed') {
      this.pricing.labourPriceMin = this.pricing.labourPriceMax = null;
    } else if (this.pricing.labourPriceType === 'range') {
      this.pricing.labourPrice = null;
    } else {
      this.pricing.labourPrice = 0;
      this.pricing.labourPriceMin = 0;
      this.pricing.labourPriceMax = 0;
    }
  }

  // shows the selected make's model panel
  onMakeSvcToggle(make: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedMakesSvc.includes(make)) {
        this.selectedMakesSvc.push(make);
      }
      if (!this.modelsByMake[make]) {
        this.fetchModels(make);
      }
      this.expandMake[make] = true;
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
      this.svcError = '';
      this.svcInfo = '';

      if (!this.pick.packageId && !this.pick.categoryId) {
        this.svcError = 'Please select a package or a service.';
        return;
      }
      if (this.pick.packageId && (this.pick.categoryId || this.pick.serviceId)) {
        this.svcError = 'You cannot select both a package and a service. Please choose only one.';
        return;
      }
      if (this.pick.categoryId && !this.pick.serviceId) {
        this.svcError = 'Please select a service after choosing a category.';
        return;
      }
      if ((this.selectedMakesSvc || []).length === 0 && !this.pick.tierId) {
        this.svcError = 'Please select at least one car make/model or a tier.'; return;
      }
      if (!this.pricing.duration || this.pricing.duration < 5) {
        this.svcError = 'Please enter a valid duration (at least 5 mins).'; return;
      }
      if (this.pricing.partPrice == null && (this.pricing.partPriceMin == null || this.pricing.partPriceMax == null)) {
        this.svcError = 'Please provide a price (fixed) or price range.';
        return;
      }
      if (this.pricing.partPriceType === 'fixed' && (!this.pricing.partPrice || this.pricing.partPrice < 0)) {
        this.svcError = 'Please enter a valid fixed price.'; return;
      }
      if (this.pricing.partPriceType === 'range' && (!this.pricing.partPriceMin || !this.pricing.partPriceMax || this.pricing.partPriceMin >= this.pricing.partPriceMax)) {
        this.svcError = 'Please enter a valid price range (min < max).'; return;
      }

      if (this.pricing.labourPriceType === 'fixed' && (!this.pricing.labourPrice || this.pricing.labourPrice < 0)) {
        this.svcError = 'Please enter a valid fixed price.'; return;
      }
      if (this.pricing.labourPriceType === 'range' && (!this.pricing.labourPriceMin || !this.pricing.labourPriceMax || this.pricing.labourPriceMin >= this.pricing.labourPriceMax)) {
        this.svcError = 'Please enter a valid price range (min < max).'; return;
      }

      if (this.serviceDescription == '' || this.serviceDescription == null) {
        this.svcError = 'Please provide a service offer description.';
        return;
      }


      // prepare offer data
      const partPrice = this.pricing.partPriceType === 'fixed' ? this.pricing.partPrice : this.pricing.partPriceType === 'none' ? 0 : null;
      const partPriceMin = this.pricing.partPriceType === 'range' ? this.pricing.partPriceMin : null;
      const partPriceMax = this.pricing.partPriceType === 'range' ? this.pricing.partPriceMax : null;

      const labourPrice = this.pricing.labourPriceType === 'fixed' ? this.pricing.labourPrice : this.pricing.labourPriceType === 'none' ? 0 : null;
      const labourPriceMin = this.pricing.labourPriceType === 'range' ? this.pricing.labourPriceMin : null;
      const labourPriceMax = this.pricing.labourPriceType === 'range' ? this.pricing.labourPriceMax : null;

      const duration = this.pricing.duration;
      const serviceDescription = this.serviceDescription;
      const timestamp = new Date();
      const newOffer: ServiceOffer = {
        id: '',
        serviceCenterId: this.serviceCenterId,
        servicePackageId: this.pick.packageId || null,
        categoryId: this.pick.categoryId || null,
        serviceId: this.pick.serviceId || null,
        tierId: this.pick.tierId || null,
        makes: [...(this.selectedMakesSvc || [])],
        models: this.selectedModelsSvc || {},
        years: Object.fromEntries(
          Object.entries(this.selectedYearsSvc || {}).map(([key, value]) => [key, value.map(String)])
        ),
        fuelTypes: this.selectedFuelTypesSvc || {},
        displacements: this.selectedDisplacementsSvc || {},
        sizeClasses: this.selectedSizeClassesSvc || {},
        duration,
        partPrice,
        partPriceMin,
        partPriceMax,
        labourPrice,
        labourPriceMin,
        labourPriceMax,
        serviceDescription,
        active: true,
        updatedAt: timestamp,
        createdAt: timestamp,
      };

      const makeFitKey = (make: string, model: string, year: string, fuel: string, disp: number, size: string) =>
        `${make}_${model}_${year}_${fuel}_${disp}_${size}`;

      const extractFitmentKeys = (offer: ServiceOffer): Set<string> => {
        const keys = new Set<string>();

        if (offer.tierId) {
          const tier = this.savedTiers.find(t => t.id === offer.tierId);
          if (tier) {
            (tier.makes || []).forEach((make: string) => {
              (tier.models?.[make] || [null]).forEach((model: string | null) => {
                (tier.years?.[model ?? ''] || [null]).forEach((year: string | null) => {
                  (tier.fuelTypes?.[model ?? ''] || [null]).forEach((fuel: string | null) => {
                    (tier.displacements?.[model ?? ''] || [null]).forEach((disp: number | null) => {
                      (tier.sizeClasses?.[model ?? ''] || [null]).forEach((size: string | null) => {
                        keys.add(makeFitKey(make, model ?? '', year ?? '', fuel ?? '', disp ?? 0, size ?? ''));
                      });
                    });
                  });
                });
              });
            });
          }
        } else {
          (offer.makes || []).forEach(make => {
            (offer.models?.[make] || [null]).forEach(model => {
              (offer.years?.[model ?? ''] || [null]).forEach(year => {
                (offer.fuelTypes?.[model ?? ''] || [null]).forEach(fuel => {
                  (offer.displacements?.[model ?? ''] || [null]).forEach(disp => {
                    (offer.sizeClasses?.[model ?? ''] || [null]).forEach(size => {
                      keys.add(makeFitKey(make, model ?? '', year ?? '', fuel ?? '', disp ?? 0, size ?? ''));
                    });
                  });
                });
              });
            });
          });
        }

        return keys;
      };

      // duplicate check against db
      const q = query(
        collection(this.firestore, 'service_center_services_offer'),
        where('serviceCenterId', '==', this.serviceCenterId),
        where('servicePackageId', '==', newOffer.servicePackageId),
        where('categoryId', '==', newOffer.categoryId),
        where('serviceId', '==', newOffer.serviceId),
        where('active', '==', true)
      );

      const existingSnap = await getDocs(q);

      const newKeys = extractFitmentKeys(newOffer);
      for (const docSnap of existingSnap.docs) {
        const offer = docSnap.data() as ServiceOffer;
        const existingKeys = extractFitmentKeys(offer);

        for (const key of newKeys) {
          if (existingKeys.has(key)) {
            this.svcError = 'This service already exists for the selected fitment/tier.';
            return;
          }
        }
      }

      await addDoc(collection(this.firestore, 'service_center_services_offer'), newOffer);
      alert('The service has been successfully created!');

      this.resetServiceUI();
      this.loadServiceOffered();
      await this.initServiceTab();

    } catch (err: any) {
      this.svcError = err?.message || 'Failed to save offer';
    }
  }

  resetServiceUI() {
    this.pick = { packageId: '', categoryId: '', serviceId: '', tierId: '' };
    this.pricing = { partPriceType: 'fixed', partPrice: null, partPriceMin: null, partPriceMax: null, labourPriceType: 'fixed', labourPrice: null, labourPriceMin: null, labourPriceMax: null, duration: null };
    this.serviceDescription = '';
    this.selectedMakesSvc = [];
    this.selectedModelsSvc = {};
    this.modelSearchSvc = {};
    this.selectedYearsSvc = {};
    this.selectedFuelTypesSvc = {};
    this.selectedDisplacementsSvc = {};
    this.selectedSizeClassesSvc = {};
    this.brandWideDisabledSvc = false;
    this.svcInfo = '';
    this.svcError = '';
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
    this.selectedTierId = tier.id;

    // Patch form values
    this.tierForm.patchValue({
      tierName: tier.tierName
    });

    // Restore selections into UI state
    this.selectedMakes = tier.makes || [];
    this.selectedModels = { ...(tier.models || {}) };
    this.selectedYears = { ...(tier.years || {}) };
    this.selectedFuelTypes = { ...(tier.fuelTypes || {}) };
    this.selectedDisplacements = { ...(tier.displacements || {}) };
    this.selectedSizeClasses = { ...(tier.sizeClasses || {}) };

    this.expandMake = {};
    this.expandModel = {};
    this.selectedMakes.forEach(make => {
      this.expandMake[make] = true;

      (this.selectedModels[make] || []).forEach(model => {
        this.expandModel[model] = true;

        // repopulate filter options for this model
        this.fetchFiltersForModel(make, model, () => {
          if (!this.selectedYears[model]) this.selectedYears[model] = [];
          if (!this.selectedFuelTypes[model]) this.selectedFuelTypes[model] = [];
          if (!this.selectedDisplacements[model]) this.selectedDisplacements[model] = [];
          if (!this.selectedSizeClasses[model]) this.selectedSizeClasses[model] = [];
        });
      });
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

  // Load all makes
  async fetchMakes() {
    const snap = await getDocs(collection(this.firestore, 'vehicles_list'));
    this.makes = snap.docs
      .map(d => d.data()['make'])
      .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
      .sort();
  }

  // Load models for a specific make
  async fetchModels(make: string, after?: () => void) {
    const q = query(collection(this.firestore, 'vehicles_list'), where('make', '==', make));
    const snap = await getDocs(q);

    const models: string[] = [];
    snap.forEach(doc => {
      const data: any = doc.data();
      if (data.model && Array.isArray(data.model)) {
        data.model.forEach((m: any) => {
          if (m.name && typeof m.name === 'string') {
            models.push(m.name);
          }
        });
      }
    });

    this.modelsByMake[make] = Array.from(new Set(models)).sort();

    after?.();
  }

  // Load fitments filters for a model
  async fetchFiltersForModel(make: string, model: string, callback?: () => void) {
    const q = query(collection(this.firestore, 'vehicles_list'), where('make', '==', make));
    const snap = await getDocs(q);

    let years: number[] = [];
    let fuels: string[] = [];
    let displacements: number[] = [];
    let sizes: string[] = [];

    snap.forEach(doc => {
      const data: any = doc.data();
      if (data.model && Array.isArray(data.model)) {
        const m = data.model.find((mm: any) => mm.name.toLowerCase() === model.toLowerCase());
        if (m) {
          m.fitments.forEach((f: any) => {
            if (f.year) years.push(Number(f.year));
            if (f.fuel) fuels.push(f.fuel);
            if (f.displacement) displacements.push(Number(f.displacement));
            if (f.sizeClass) sizes.push(f.sizeClass);
          });
        }
      }
    });

    this.yearsByModel[model] = Array.from(new Set(years)).sort((a, b) => b - a);
    this.fuelTypesByModel[model] = Array.from(new Set(fuels)).sort();
    this.displacementsByModel[model] = Array.from(new Set(displacements)).sort((a, b) => b - a);
    this.sizeClassesByModel[model] = Array.from(new Set(sizes)).sort();

    // Aggregate by make
    this.fuelTypesByModel[make] = Array.from(new Set([...(this.fuelTypesByModel[make] || []), ...this.fuelTypesByModel[model]]));
    this.displacementsByModel[make] = Array.from(new Set([...(this.displacementsByModel[make] || []), ...this.displacementsByModel[model]]));
    this.sizeClassesByModel[make] = Array.from(new Set([...(this.sizeClassesByModel[make] || []), ...this.sizeClassesByModel[model]]));

    if (callback) callback();
  }

  fetchFuelTypes() {
    this.allFuelTypes = [
      'Petrol RON95',
      'Petrol RON97',
      'Diesel',
      'EV',
      'Hybrid (RON97 + EV)',
      'Hybrid (RON95 + EV)'
    ];
  }

  fetchSizeClasses() {
    this.allSizeClasses = [
      'A-Segment (Mini Car)',
      'B-Segment (Compact Car)',
      'C-Segment (Compact Sedan/Hatchback)',
      'D-Segment (Midsize Sedan)',
      'E-Segment (Executive / Large Sedan)',
      'Sports Car / Coupe',
      'Small SUV / Crossover',
      'Mid/Large SUV',
      'SUV',
      'MPV / Minivan',
      'Station Wagon (Small)',
      'Station Wagon (Midsize)',
      'Station Wagon (Large)',
      'Station Wagon',
      'Pickup (Small)',
      'Pickup (Standard / Double Cab)',
      'Pickup',
      'Van (Cargo)',
      'Van (Passenger)',
      'Van',
      'Commercial / Special Purpose'
    ];
  }

  convertFuelTypeToMalaysia(apiFuel: string): string {
    const f = apiFuel.toLowerCase();

    if (f.includes('diesel'))
      return 'Diesel';
    if (f.includes('electricity') && f.includes('gas'))
      return 'Hybrid (RON97 + EV)';
    if (f.includes('electricity') && f.includes('premium'))
      return 'Hybrid (RON97 + EV)';
    if (f.includes('electricity') && f.includes('regular'))
      return 'Hybrid (RON95 + EV)';
    if (f.includes('electricity'))
      return 'EV';
    if (f.includes('premium'))
      return 'Petrol RON97';
    if (f.includes('regular') || f.includes('gasoline'))
      return 'Petrol RON95';
    if (f.includes('e85'))
      return 'Petrol RON95';
    if (f.includes('hydrogen'))
      return 'Hydrogen (FCEV)';
    if (f.includes('cng'))
      return 'NGV (Natural Gas)';
    if (f.includes('midgrade'))
      return 'Petrol RON95';

    return f;
  }

  convertSizeClassToMalaysia(apiSize: string): string {
    const s = apiSize.toLowerCase();

    // Cars
    if (s.includes('minicompact'))
      return 'A-Segment (Mini Car)';
    if (s.includes('subcompact'))
      return 'B-Segment (Compact Car)';
    if (s.includes('compact'))
      return 'C-Segment (Compact Sedan/Hatchback)';
    if (s.includes('midsize') && s.includes('wagon'))
      return 'Station Wagon (Midsize)';
    if (s.includes('midsize'))
      return 'D-Segment (Midsize Sedan)';
    if (s.includes('large'))
      return 'E-Segment (Executive / Large Sedan)';
    if (s.includes('two seat'))
      return 'Sports Car / Coupe';

    // SUVs
    if (s.includes('small sport utility'))
      return 'Small SUV / Crossover';
    if (s.includes('standard sport utility'))
      return 'Mid/Large SUV';
    if (s.includes('sport utility vehicle'))
      return 'SUV';

    // MPV / Minivan
    if (s.includes('minivan'))
      return 'MPV / Minivan';
    if (s.includes('station wagon') && s.includes('large'))
      return 'Station Wagon (Large)';
    if (s.includes('station wagon') && s.includes('small'))
      return 'Station Wagon (Small)';
    if (s.includes('station wagon'))
      return 'Station Wagon';

    // Pickups
    if (s.includes('small pickup'))
      return 'Pickup (Small)';
    if (s.includes('standard pickup'))
      return 'Pickup (Standard / Double Cab)';
    if (s.includes('pickup'))
      return 'Pickup';

    // Vans & Special Purpose
    if (s.includes('cargo'))
      return 'Van (Cargo)';
    if (s.includes('passenger'))
      return 'Van (Passenger)';
    if (s.includes('van'))
      return 'Van';
    if (s.includes('special purpose'))
      return 'Commercial / Special Purpose';

    return apiSize;
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

  selectFilteredModelsSvc(make: string) {
    const filtered = this.getFilteredModelsSvc(make);
    if (!this.selectedModelsSvc[make]) {
      this.selectedModelsSvc[make] = [];
    }
    filtered.forEach(model => {
      if (!this.selectedModelsSvc[make].includes(model)) {
        this.selectedModelsSvc[make].push(model);
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

  clearFilteredModelsSvc(make: string) {
    const filtered = new Set(this.getFilteredModelsSvc(make));
    if (!this.selectedModelsSvc[make]) return;
    this.selectedModelsSvc[make] = this.selectedModelsSvc[make].filter(m => {
      const remove = filtered.has(m);
      if (remove) this.clearModelFiltersSvc(m);
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

  clearModelFiltersSvc(model: string) {
    delete this.yearsByModel[model];

    // commented it due to currently wanted to remain the filters of these 3 when click on clear filters
    // delete this.fuelTypesByModel[model];
    // delete this.displacementsByModel[model];
    // delete this.sizeClassesByModel[model];
    delete this.selectedYearsSvc[model];
    delete this.selectedFuelTypesSvc[model];
    delete this.selectedDisplacementsSvc[model];
    delete this.selectedSizeClassesSvc[model];
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
      const tierName = this.tierForm.value.tierName.trim().toLowerCase();

      // Check for duplicate tier name
      const q = query(
        collection(this.firestore, 'service_center_service_tiers'),
        where('serviceCenterId', '==', this.serviceCenterId),
        where('tierName', '==', tierName)
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // conflict only if found doc is not the same one
        const conflict = snapshot.docs.some(docSnap => {
          const existingName = (docSnap.data()['tierName'] || '').trim().toLowerCase();
          return existingName === tierName && docSnap.id !== this.selectedTierId;
        });

        if (conflict) {
          alert('A tier with this name already exists. Please choose a different name.');
          return;
        }
      }

      if (this.selectedTierId) {
        // Update existing
        await updateDoc(doc(this.firestore, 'service_center_service_tiers', this.selectedTierId), data);
        alert('Tier updated successfully!');
        this.errorMessage = '';
        this.selectedTierId = '';
        this.tierForm.reset({ serviceCenterId: this.serviceCenterId });
        this.clearAllMakes();
        this.loadSavedTiers();
        this.updateSvcTierSelection();
      } else {
        // Create new
        await addDoc(collection(this.firestore, 'service_center_service_tiers'), data);
        alert('Tier saved successfully!');
        this.errorMessage = '';
        this.selectedTierId = '';
        this.tierForm.reset({ serviceCenterId: this.serviceCenterId });
        this.clearAllMakes();
        this.loadSavedTiers();
        this.updateSvcTierSelection();
      }
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to save tier';
    }
  }

  async updateSvcTierSelection() {
    const tierSnap = await getDocs(query(collection(this.firestore, 'service_center_service_tiers'), where('serviceCenterId', '==', this.serviceCenterId)));
    this.serviceTiers = tierSnap.docs.map(tier => ({ id: tier.id, ...tier.data() }));
  }

  // request service tab
  async loadServiceCategoriesRequests() {
    try {
      const serviceCategoriesQuery = query(
        collection(this.firestore, 'services_categories_request'),
        where('createdBy', '==', this.serviceCenterId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(serviceCategoriesQuery);
      this.newServiceCategoriesRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('Loaded service categories requests:', this.newServiceCategoriesRequests);
    } catch (error) {
      console.error('Error loading service categories requests:', error);
      alert('Failed to load service categories requests');
    }
  }

  async loadServicesRequests() {
    try {
      const servicesQuery = query(
        collection(this.firestore, 'services_request'),
        where('createdBy', '==', this.serviceCenterId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(servicesQuery);
      this.newServicesRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('Loaded services requests:', this.newServicesRequests);
    } catch (error) {
      console.error('Error loading services requests:', error);
      alert('Failed to load services requests');
    }
  }

  get totalPagesCategories(): number {
    return Math.ceil(this.newServiceCategoriesRequests.length / this.categoryRequestPageSize);
  }

  get paginatedServiceCategories(): any[] {
    const startIndex = (this.currentPageCategories - 1) * this.categoryRequestPageSize;
    const endIndex = startIndex + this.categoryRequestPageSize;
    return this.newServiceCategoriesRequests.slice(startIndex, endIndex);
  }

  get totalPagesServices(): number {
    return Math.ceil(this.newServicesRequests.length / this.serviceRequestPageSize);
  }

  get paginatedServices(): any[] {
    const startIndex = (this.currentPageServices - 1) * this.serviceRequestPageSize;
    const endIndex = startIndex + this.serviceRequestPageSize;
    return this.newServicesRequests.slice(startIndex, endIndex);
  }

  goToPageCategories(page: number) {
    if (page < 1 || page > this.totalPagesCategories) return;
    this.currentPageCategories = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToPageServices(page: number) {
    if (page < 1 || page > this.totalPagesServices) return;
    this.currentPageServices = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private toUpperCase(text: string): string {
    return text
      .toLowerCase()
      .split(' ')
      .filter(word => word.trim() !== '') // remove double spaces
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async requestCategory(categoryName: string, categoryDescription: string, serviceCenterId: string) {
    this.requestCatLoading = true;
    if (!categoryName) {
      alert('Category name is required.');
      this.requestCatLoading = false;
      return;
    }
    try {
      await addDoc(collection(this.firestore, 'services_categories_request'), {
        name: this.toUpperCase(categoryName),
        description: categoryDescription,
        active: false,
        status: 'pending',
        createdBy: serviceCenterId,
        createdAt: serverTimestamp(),
      });
      alert('Category request submitted successfully!');
      this.newCategoryName = '';
      this.newCategoryDescription = '';
      this.loadServiceCategoriesRequests();
    } catch (err: any) {
      console.error('Error requesting category:', err);
      alert('Failed to submit category request');
    } finally {
      this.requestCatLoading = false;
    }
  }

  async requestService(categoryId: string, serviceName: string, serviceDescription: string, serviceCenterId: string) {
    this.requestSvcLoading = true;

    if (!serviceName) {
      alert('Service name is required.');
      this.requestSvcLoading = false;
      return;
    }
    if (!categoryId) {
      alert('Please select a category for the service.');
      this.requestSvcLoading = false;
      return;
    }

    try {
      await addDoc(collection(this.firestore, 'services_request'), {
        categoryId,
        name: this.toUpperCase(serviceName),
        description: serviceDescription,
        active: false,
        status: 'pending',
        createdBy: serviceCenterId,
        createdAt: serverTimestamp(),
      });
      alert('Service request submitted successfully!');
      this.loadServicesRequests();
      this.newServiceName = '';
      this.newServiceDescription = '';
      this.selectedCategoryId = '';
    } catch (err: any) {
      console.error('Error requesting service:', err);
      alert('Failed to submit service request');
    } finally {
      this.requestSvcLoading = false;
    }
  }

  getStatusBorderColor(status: string): string {
    const borderColors: { [key: string]: string } = {
      'pending': '#ffc107',
      'approved': '#198754',
      'rejected': '#dc3545',
    };
    return borderColors[status?.toLowerCase()] || '#6c757d';
  }

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'badge bg-warning',
      'approved': 'badge bg-success',
      'rejected': 'badge bg-danger',
    };
    return classes[status] || 'badge bg-secondary';
  }

  getStatusIcon(status: string): string {
    const statusIcons: { [key: string]: string } = {
      'pending': 'bi-clock-history',
      'approved': 'bi-check-circle',
      'rejected': 'bi-x-circle',
    };

    return statusIcons[status?.toLowerCase()] || 'bi-question-circle';
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'pending': 'Pending',
      'approved': 'Approved',
      'rejected': 'Rejected',
    };
    return texts[status] || status;
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // setup package tab
  async loadSavedPackages() {
    try {
      this.loadingSavedPackages = true;

      const savedPackageRef = collection(this.firestore, 'service_packages');
      const q = query(savedPackageRef, where('serviceCenterId', '==', this.serviceCenterId));
      const savedPackageSnap = await getDocs(q);

      const packages: any[] = [];

      for (const docSnap of savedPackageSnap.docs) {
        const pkgData = docSnap.data() as any;

        // Resolve services with names + categories
        const enrichedServices: any[] = [];
        if (pkgData.services && pkgData.services.length) {
          for (const svc of pkgData.services) {
            if (!svc.serviceId) continue;

            const serviceRef = doc(this.firestore, 'services', svc.serviceId);
            const serviceSnap = await getDoc(serviceRef);

            if (serviceSnap.exists()) {
              const serviceData = serviceSnap.data() as any;

              // get category name
              let categoryName = '';
              if (serviceData.categoryId) {
                const categoryRef = doc(this.firestore, 'services_categories', serviceData.categoryId);
                const categorySnap = await getDoc(categoryRef);
                if (categorySnap.exists()) {
                  categoryName = (categorySnap.data() as any).name;
                }
              }

              enrichedServices.push({
                serviceId: svc.serviceId,
                serviceName: serviceData.name,
                categoryId: serviceData.categoryId,
                categoryName,
              });
            }
          }
        }

        packages.push({
          id: docSnap.id,
          ...pkgData,
          services: enrichedServices,
        });
      }

      this.savedPackages = packages;
    } catch (err) {
      console.error('Error loading saved packages:', err);
    } finally {
      this.loadingSavedPackages = false;
    }
  }

  editPackage(pkg: ServicePackage) {
    if (!pkg.id) return;

    this.editingPackageId = pkg.id;
    this.editDescription = pkg.description || '';
  }

  async saveEditedPackage() {
    if (!this.editingPackageId) return;

    const pkgRef = doc(this.firestore, 'service_packages', this.editingPackageId);

    await updateDoc(pkgRef, {
      description: this.editDescription,
      updatedAt: serverTimestamp(),
    });

    this.editingPackageId = null;
    this.editDescription = '';

    await this.loadSavedPackages();
  }

  cancelEditPackage() {
    this.editingPackageId = null;
    this.editDescription = '';
  }

  async deletePackage(pkg: ServicePackage) {
    if (!pkg.id) return;

    if (confirm(`Are you sure you want to delete package "${pkg.name}"?`)) {
      try {
        await deleteDoc(doc(this.firestore, 'service_packages', pkg.id));
        console.log('Package deleted successfully');
      } catch (err) {
        console.error('Error deleting package:', err);
      }
    }
  }

  onPackagePickCategory() {
    this.packagePick.serviceId = '';
  }

  addServiceToPackage() {
    if (!this.packagePick.categoryId || !this.packagePick.serviceId) return;

    const category = this.categories.find(c => c.id === this.packagePick.categoryId);
    const service = this.servicesByCategory[this.packagePick.categoryId].find(s => s.id === this.packagePick.serviceId);

    // deduplicates
    const alreadyExists = this.packageForm.services.some(p => p.serviceId === service.id);
    if (alreadyExists) return;

    this.packageForm.services.push({
      categoryId: category.id,
      categoryName: category.name,
      serviceId: service.id,
      serviceName: service.name
    });

    // reset picker
    this.packagePick = { categoryId: category.id, serviceId: '' };
  }

  // Remove service
  removeServiceFromPackage(index: number) {
    this.packageForm.services.splice(index, 1);
  }

  async savePackage() {
    this.savePackageLoading = true;

    if (!this.packageForm.name || this.packageForm.services.length === 0) {
      alert('Please provide a package name and at least one service.');
      this.savePackageLoading = false;
      return;
    }

    try {
      await addDoc(collection(this.firestore, 'service_packages'), {
        ...this.packageForm,
        serviceCenterId: this.serviceCenterId,
        createdAt: new Date(),
        active: true
      });
      alert('Service Package created successfully!');
      // reset form
      this.packageForm = { name: '', description: '', services: [] };
    } catch (error) {
      console.error('Error creating service package:', error);
      alert('Failed to create service package');
    } finally {
      this.savePackageLoading = false;
    }
  }

  // tab of new vehicle requests
  async loadVehiclesRequests() {
    const requestsRef = collection(this.firestore, 'vehicle_attribute_requests');
    const snap = await getDocs(requestsRef);
    this.pendingRequests = snap.docs
      .map(docSnap => {
        const data = docSnap.data() as VehicleRequest;
        return {
          id: docSnap.id,
          make: data.make,
          model: data.model ?? [],
          serviceCenterId: data.serviceCenterId,
          serviceCenterName: data.serviceCenterName,
          status: data.status,
          rejectionReason: data.rejectionReason || 'N/A',
          requestedAt: data.requestedAt
        };
      })
      .filter(req => req.serviceCenterId === this.serviceCenterId);
  }


  // fitments of make model and year filter
  trackByMake = (_: number, make: string) => make;
  trackByModel = (_: number, model: string) => model;
  trackByYear = (_: number, y: number) => y;
}
