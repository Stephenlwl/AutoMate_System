import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, getDocs, where, query, deleteDoc, doc } from '@angular/fire/firestore';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth/service-center-auth';
import { Modal } from 'bootstrap';

type YearPreset = 'latest5' | 'all' | 'even' | 'odd';

@Component({
  selector: 'app-manage-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, FormsModule],
  styleUrls: ['./manage-services.component.css'],
  templateUrl: './manage-services.component.html'
})
export class ServiceCenterServiceComponent implements OnInit {
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  workshopId!: string;
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
    this.workshopId = this.auth.getAdmin().id;
    this.tierForm = this.fb.group({
      tierName: ['', Validators.required],
    });
    this.loadSavedTiers();
    this.fetchMakes();
  }

  async loadSavedTiers(): Promise<void> {
    try {
      const tiersRef = collection(this.firestore, 'service_tiers');
      const q = query(tiersRef, where('workshopId', '==', this.workshopId));
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
          workshopId: data.workshopId
        };
      });
    } catch (error) {
      console.error('Failed to load service tiers:', error);
    }
  }

  async duplicateTier(tier: any) {
    const copy = {
      tierName: `${tier.tierName} *Copy`,
      workshopId: this.workshopId,
      makes: tier.makes,
      models: tier.models,
      years: tier.years,
      fuelTypes: tier.fuelTypes,
      displacements: tier.displacements,
      sizeClasses: tier.sizeClasses,
    };
    try {
      await addDoc(collection(this.firestore, 'service_tiers'), copy);
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
        await deleteDoc(doc(this.firestore, 'service_tiers', tier.id));

        alert('Tier deleted successfully.');
        this.loadSavedTiers();
      } catch (error: any) {
        alert(error.message || 'Failed to delete tier.');
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
    toAdd.forEach(md => {
      if (!this.yearsByModel[md]) {
        this.fetchFiltersForModel(make, md);
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
      case 'all': picked = [...all]; break;
      case 'even': picked = all.filter(y => y % 2 === 0); break;
      case 'odd': picked = all.filter(y => y % 2 !== 0); break;
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
      workshopId: this.workshopId,
      makes: this.selectedMakes,
      models: this.selectedModels,
      years: this.selectedYears,
      fuelTypes: filteredFuelTypes,
      displacements: filteredDisplacements,
      sizeClasses: filteredSizeClasses
    };

    try {
      await addDoc(collection(this.firestore, 'service_tiers'), data);
      alert('Tier saved successfully!');
      this.errorMessage = '';
      this.tierForm.reset({ workshopId: this.workshopId });
      this.clearAllMakes();
      this.loadSavedTiers();
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to save tier';
    }
  }

  // trackBys for perf 
  trackByMake = (_: number, make: string) => make;
  trackByModel = (_: number, model: string) => model;
  trackByYear = (_: number, y: number) => y;
}
