import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, setDoc } from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Modal } from 'bootstrap';
import { Timestamp } from 'firebase/firestore';
import { AdminService } from '../auth/system-admin-auth';

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

interface Vehicle {
  id?: string;
  make: string;
  model: VehicleModel[];
  createdAt?: Date;
}

interface VehicleRequest {
  id: string;
  make: string;
  model: VehicleModel[];
  serviceCenterId: string;
  serviceCenterName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
}

@Component({
  selector: 'app-manage-vehicles-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule],
  templateUrl: './manage-vehicles-list.component.html',
  styleUrls: ['./manage-vehicles-list.component.css']
})
export class ManageVehiclesListComponent implements OnInit {
  apiMakes: string[] = [];
  loadingMakes = false;
  addingMake = false;
  searchMake: string = '';
  vehicles: Vehicle[] = [];
  pendingRequests: VehicleRequest[] = [];
  allFuelTypes: string[] = [];
  allSizeClasses: string[] = [];
  newMakeRequest: string = '';
  selectedMake: string = '';
  newModels: any[] = [];
  tab: 'current' | 'pending' | 'import' | 'add' = 'current';
  brandSelectionType: 'new' | 'existing' = 'existing';
  rejectionReason: string = '';
  selectedRequest: VehicleRequest | null = null;
  private rejectionModal: any;

  // ui State
  expandMake: { [key: string]: boolean } = {};
  modelSearch: { [make: string]: string } = {};
  yearFilter: { [make: string]: string } = {};
  fuelFilter: { [make: string]: string } = {};
  sizeFilter: { [make: string]: string } = {};
  expandedMakeDetails: { [make: string]: VehicleModel[] } = {};
  loadingMakeDetails: { [make: string]: boolean } = {};
  expandFitment: { [modelName: string]: boolean } = {};

  private firestore = inject(Firestore);
  private http = inject(HttpClient);
  private auth = inject(AdminService);

  async ngOnInit() {
    await this.loadVehicles();
    await this.loadPendingRequests();
    this.fetchFuelTypes();
    this.fetchSizeClasses();
    await this.fetchApiMakes();
  }

  ngAfterViewInit() {
  this.rejectionModal = new Modal(document.getElementById('rejectionModal')!);
}

  async loadVehicles() {
    const vehiclesRef = collection(this.firestore, 'vehicles_list');
    const snap = await getDocs(vehiclesRef);

    this.vehicles = snap.docs.map(docSnap => {
      const v = { id: docSnap.id, ...(docSnap.data() as Vehicle) };

      // Sort models by alphabatic asc
      v.model.sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
      });

      // Sort fitments in each model by year desc
      v.model.forEach(m => {
        m.fitments.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
      });

      return v;
    });

    // Sort the vehicles list by their alphabatic asc
    this.vehicles.sort((a, b) => {
      if (a.make < b.make) return -1;
      if (a.make > b.make) return 1;
      return 0;
    });
  }

  async loadPendingRequests() {
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
          requestedAt: data.requestedAt
        };
      })
      .filter(req => req.status === 'pending');
  }

  async fetchApiMakes() {
    this.loadingMakes = true;
    try {
      const url = 'https://public.opendatasoft.com/api/records/1.0/search/?dataset=all-vehicles-model&rows=0&facet=make';
      const res: any = await this.http.get(url).toPromise();
      this.apiMakes = res.facet_groups[0].facets.map((f: any) => f.name).sort();
    } catch (err) {
      console.error('Failed to fetch API makes', err);
    } finally {
      this.loadingMakes = false;
    }
  }

  // current vehicle list tab1
  async removeMake(vehicle: Vehicle) {
    if (!confirm(`Are you sure you want to delete the entire make: ${vehicle.make}?`)) return;
    if (vehicle.id) {
      await deleteDoc(doc(this.firestore, 'vehicles_list', vehicle.id));
      alert(`Removed make: ${vehicle.make}`);
      await this.loadVehicles();
    }
  }

  async removeModel(vehicle: Vehicle, model: VehicleModel) {
    if (!confirm(`Remove model ${model.name} from ${vehicle.make}?`)) return;
    if (vehicle.id) {
      const updatedModels = vehicle.model.filter(m => m.name !== model.name);
      await setDoc(doc(this.firestore, 'vehicles_list', vehicle.id), { ...vehicle, model: updatedModels });
      alert(`Removed model: ${model.name}`);
      await this.loadVehicles();
    }
  }

  async removeFitment(vehicle: Vehicle, model: VehicleModel, fitment: Fitment) {
    if (!confirm(`Remove fitment ${fitment.year} - ${fitment.fuel} from ${model.name}?`)) return;
    if (vehicle.id) {
      const updatedModels = vehicle.model.map(m => {
        if (m.name === model.name) {
          return {
            ...m, fitments: m.fitments.filter(f =>
              !(f.year === fitment.year && f.fuel === fitment.fuel && f.displacement === fitment.displacement && f.sizeClass === fitment.sizeClass)
            )
          };
        }
        return m;
      });
      await setDoc(doc(this.firestore, 'vehicles_list', vehicle.id), { ...vehicle, model: updatedModels });
      alert(`Removed fitment from ${model.name}`);
      await this.loadVehicles();
    }
  }

  getLatestYear(vehicle: Vehicle): number {
    let years: number[] = [];

    vehicle.model.forEach(m => {
      m.fitments.forEach(f => {
        const yr = parseInt(f.year, 10);
        if (!isNaN(yr)) years.push(yr);
      });
    });

    return years.length > 0 ? Math.max(...years) : 0;
  }

  toggleFitmentPanel(modelName: string) {
    this.expandFitment[modelName] = !this.expandFitment[modelName];
  }

  trackByFitment(index: number, f: Fitment) {
    return `${f.year}-${f.fuel}-${f.displacement}-${f.sizeClass}`;
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
      'Pickup (Small)',
      'Pickup (Standard / Double Cab)',
      'Van (Cargo)',
      'Van (Passenger)',
      'Commercial / Special Purpose'
    ];
  }

  isMakeImported(make: string): boolean {
    return this.vehicles.some(v => v.make.toLowerCase() === make.toLowerCase());
  }

  toggleMakePanel(make: string) {
    this.expandMake[make] = !this.expandMake[make];
  }

  getFilteredModels(vehicle: Vehicle): VehicleModel[] {
    const searchInput = this.modelSearch[vehicle.make]?.toLowerCase() || '';
    const year = this.yearFilter[vehicle.make] || '';
    const fuel = this.fuelFilter[vehicle.make] || '';
    const size = this.sizeFilter[vehicle.make] || '';

    return vehicle.model
      .map(m => {
        // filter fitments individually
        const filteredFitments = m.fitments.filter(f => {
          const matchYear = !year || f.year === year;
          const matchFuel = !fuel || f.fuel === fuel;
          const matchSize = !size || f.sizeClass === size;
          return matchYear && matchFuel && matchSize;
        });

        // return model with filtered fitments
        return {
          ...m,
          fitments: filteredFitments
        };
      })
      .filter(m => {
        // keep model if matches keyword and has at least 1 fitment left
        const matchesModel = !searchInput || m.name.toLowerCase().includes(searchInput);
        return matchesModel && m.fitments.length > 0;
      });
  }

  getFuelTypes(vehicle: Vehicle): string[] {
    const fuels = new Set<string>();
    vehicle.model.forEach(m =>
      m.fitments.forEach(f => fuels.add(f.fuel))
    );
    return Array.from(fuels).sort();
  }

  getSizeClasses(vehicle: Vehicle): string[] {
    const sizes = new Set<string>();
    vehicle.model.forEach(m =>
      m.fitments.forEach(f => sizes.add(f.sizeClass))
    );
    return Array.from(sizes).sort();
  }

  getDisplacements(vehicle: Vehicle): string[] {
    const disps = new Set<string>();
    vehicle.model.forEach(m =>
      m.fitments.forEach(f => {
        if (Array.isArray(f.displacement)) {
          f.displacement.forEach(d => disps.add(d));
        } else {
          disps.add(f.displacement);
        }
      })
    );
    return Array.from(disps).sort();
  }

  getYears(vehicle: Vehicle): string[] {
    const years = new Set<string>();
    vehicle.model.forEach(m =>
      m.fitments.forEach(f => years.add(f.year))
    );
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }

  // Under the Pending Requests Tab functions tab2
  isFitmentExist(make: string, modelName: string, fitment: Fitment): boolean {
    const vehicle = this.vehicles.find(v => v.make.toLowerCase() === make.toLowerCase());
    const existingModel = vehicle?.model.find(m => m.name.toLowerCase() === modelName.toLowerCase());
    if (!existingModel) return false;

    const key = `${fitment.year}-${fitment.fuel}-${fitment.displacement}-${fitment.sizeClass}`;
    return existingModel.fitments.some(f =>
      `${f.year}-${f.fuel}-${f.displacement}-${f.sizeClass}` === key
    );
  }

  carMakeRequestExist(req: VehicleRequest): boolean {
    return req.model.every(m =>
      m.fitments.every(f => this.isFitmentExist(req.make, m.name, f))
    );
  }

  async approveRequest(req: VehicleRequest) {
    try {
      // Get all existing makes
      const existingMake = this.vehicles.find(v => v.make.toLowerCase() === req.make.toLowerCase());

      if (existingMake) {
        // Process only new models/fitments
        let updatedModels = [...existingMake.model];
        let addedSomething = false;

        for (const newModel of req.model) {
          const existingModel = updatedModels.find(m => m.name.toLowerCase() === newModel.name.toLowerCase());

          if (existingModel) {
            // Only add new fitments
            for (const f of newModel.fitments) {
              const key = `${f.year}-${f.fuel}-${f.displacement}-${f.sizeClass}`;
              const exists = existingModel.fitments.some(
                ef => `${ef.year}-${ef.fuel}-${ef.displacement}-${ef.sizeClass}` === key
              );
              if (!exists) {
                existingModel.fitments.push({ ...f, status: 'approved' });
                addedSomething = true;
              }
            }
          } else {
            // Whole model is new add it
            updatedModels.push({
              ...newModel,
              fitments: newModel.fitments.map(f => ({ ...f, status: 'approved' }))
            });
            addedSomething = true;
          }
        }

        if (!addedSomething) {
          alert(`No new models/fitments to approve for ${req.make}.`);
        } else {
          await updateDoc(doc(this.firestore, 'vehicles_list', existingMake.id!), {
            model: updatedModels
          });
          alert(`Approved updates for ${req.make}`);
        }
      } else {
        // If the whole make is new
        await addDoc(collection(this.firestore, 'vehicles_list'), {
          make: req.make,
          model: req.model.map(m => ({
            ...m,
            fitments: m.fitments.map(f => ({ ...f, status: 'approved' }))
          })),
          createdAt: new Date()
        });
        alert(`Approved new make: ${req.make}`);
      }

      if (req.id) {
        await updateDoc(doc(this.firestore, 'vehicle_attribute_requests', req.id), { status: 'approved' });
      }

      await this.loadPendingRequests();
      await this.loadVehicles();
    } catch (err) {
      console.error(err);
      alert('Failed to approve request.');
    }
  }

  openRejectModal(req: VehicleRequest) {
  this.selectedRequest = req;
  this.rejectionReason = '';
  this.rejectionModal.show();
}

 async confirmReject() {
  if (!this.selectedRequest || !this.rejectionReason?.trim()) {
    return;
  }

  try {
    if (this.selectedRequest.id) {
      await updateDoc(doc(this.firestore, 'vehicle_attribute_requests', this.selectedRequest.id), { 
        status: 'rejected',
        rejectionReason: this.rejectionReason.trim(),
        reviewedAt: Timestamp.now(),
        reviewedBy: this.auth.getAdminName?.() || 'system'
      });
    }
    
    this.rejectionModal.hide();
    
    // Show success message
    alert(`Request for ${this.selectedRequest.make} has been rejected.`);
    
    // Reload data
    await this.loadPendingRequests();
    
  } catch (err) {
    console.error('Error rejecting request:', err);
    alert('Failed to reject request. Please try again.');
  } finally {
    this.selectedRequest = null;
    this.rejectionReason = '';
  }
}

cancelReject() {
  this.selectedRequest = null;
  this.rejectionReason = '';
  this.rejectionModal.hide();
}

  // under adding vehicle data to vehicle list tab3
  async openMakeDetails(make: string) {
    // If already expanded, collapse
    if (this.expandedMakeDetails[make]) {
      delete this.expandedMakeDetails[make];
      return;
    }

    this.loadingMakeDetails[make] = true;
    try {
      const url = `https://public.opendatasoft.com/api/records/1.0/search/?dataset=all-vehicles-model&rows=5000&refine.make=${encodeURIComponent(make)}`;
      const res: any = await this.http.get(url).toPromise();

      const groupedModels: { [model: string]: Fitment[] } = {};

      for (const r of res.records) {
        const f = r.fields;
        const modelName = f.model || 'Unknown';

        if (!groupedModels[modelName]) groupedModels[modelName] = [];

        // deduplicate by composite key
        const compositeKey = `${f.year}-${f.fueltype}-${f.displ}-${f.vclass}`;
        if (!groupedModels[modelName].some(existing =>
          `${existing.year}-${existing.fuel}-${existing.displacement}-${existing.sizeClass}` === compositeKey
        )) {
          groupedModels[modelName].push({
            year: f.year || '',
            fuel: this.convertFuelTypeToMalaysia(f.fueltype) || 'Unknown',
            displacement: f.displ || '',
            sizeClass: this.convertSizeClassToMalaysia(f.vclass) || '',
            status: 'approved'
          });
        }
      }

      this.expandedMakeDetails[make] = Object.keys(groupedModels).map(modelName => ({
        name: modelName,
        fitments: groupedModels[modelName]
      }));
    } catch (err) {
      console.error('Failed to fetch make details', err);
    } finally {
      this.loadingMakeDetails[make] = false;
    }
  }

  getEachModelYears(fitments: Fitment[]): string[] {
    const years = new Set(fitments.map(f => f.year));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }

  filteredApiMakes() {
    if (!this.searchMake.trim()) return this.apiMakes;
    return this.apiMakes.filter(m => m.toLowerCase().includes(this.searchMake.toLowerCase()));
  }

  async importMakeFromApi(make: string) {
    try {
      this.addingMake = true;

      // check if already exists in db
      const existing = this.vehicles.find(v => v.make.toLowerCase() === make.toLowerCase());
      if (existing) {
        alert(`${make} already exists in vehicle list.`);
        return;
      }

      // fetch all models for the make
      const url = `https://public.opendatasoft.com/api/records/1.0/search/?dataset=all-vehicles-model&rows=5000&refine.make=${encodeURIComponent(make)}`;
      const res: any = await this.http.get(url).toPromise();

      const groupedModels: { [model: string]: Fitment[] } = {};

      for (const r of res.records) {
        const f = r.fields;
        const model = f.model || '-';
        if (!groupedModels[model]) {
          groupedModels[model] = [];
        }

        const fitment: Fitment = {
          year: f.year || '',
          fuel: this.convertFuelTypeToMalaysia(f.fueltype) || '-',
          displacement: f.displ || '',
          sizeClass: this.convertSizeClassToMalaysia(f.vclass) || '-',
          status: 'approved'
        };

        // set the keys for different combination of fitments for each model
        const key = `${fitment.year}-${fitment.fuel}-${fitment.displacement}-${fitment.sizeClass}`;
        // check got existing fitment if is difference then store to db
        if (!groupedModels[model].some(mf =>
          `${mf.year}-${mf.fuel}-${mf.displacement}-${mf.sizeClass}` === key)) {
          groupedModels[model].push(fitment);
        }
      }

      const models: VehicleModel[] = Object.keys(groupedModels).map(modelName => ({
        name: modelName,
        fitments: groupedModels[modelName]
      }));

      // store in db
      await addDoc(collection(this.firestore, 'vehicles_list'), {
        make,
        model: models,
        createdAt: new Date()
      });

      alert(`${make} added successfully`);
      await this.loadVehicles();
    } catch (err) {
      console.error(err);
      alert(`Failed to add ${make}`);
    } finally {
      this.addingMake = false;
    }
  }

  async importModel(make: string, model: VehicleModel) {
    try {
      // Find if make already exists
      const existing = this.vehicles.find(v => v.make.toLowerCase() === make.toLowerCase());
      if (existing) {
        // Find if model exists under this make
        const existingModel = existing.model.find(m => m.name.toLowerCase() === model.name.toLowerCase());
        if (existingModel) {
          alert(`${make} - ${model.name} already exists in the vehicle list.`);
          return;
        }

        // If make exists but model doesn’t, update the doc by pushing new model
        await updateDoc(doc(this.firestore, 'vehicles_list', existing.id!), {
          model: [...existing.model, model]
        });

        alert(`Added ${make} - ${model.name}`);
      } else {
        // If make doesn’t exist at all, create new doc
        await addDoc(collection(this.firestore, 'vehicles_list'), {
          make,
          model: [model],
          createdAt: new Date()
        });
        alert(`Added ${make} - ${model.name}`);
      }

      await this.loadVehicles();
    } catch (err) {
      console.error(err);
      alert(`Failed to add ${make} - ${model.name}`);
    }
  }

  async importModelFitment(make: string, model: VehicleModel, fitment: Fitment) {
    try {
      const existing = this.vehicles.find(v => v.make.toLowerCase() === make.toLowerCase());
      if (existing) {
        const existingModel = existing.model.find(m => m.name.toLowerCase() === model.name.toLowerCase());
        if (existingModel) {
          const key = `${fitment.year}-${fitment.fuel}-${fitment.displacement}-${fitment.sizeClass}`;
          const alreadyExists = existingModel.fitments.some(f =>
            `${f.year}-${f.fuel}-${f.displacement}-${f.sizeClass}` === key
          );

          if (alreadyExists) {
            alert(`${make} - ${model.name} (${fitment.year}) already exists.`);
            return;
          }

          // Append new fitment to that model
          const updatedModels = existing.model.map(m =>
            m.name.toLowerCase() === model.name.toLowerCase()
              ? { ...m, fitments: [...m.fitments, fitment] }
              : m
          );

          await updateDoc(doc(this.firestore, 'vehicles_list', existing.id!), {
            model: updatedModels
          });

          alert(`Added ${make} - ${model.name} (${fitment.year})`);
        } else {
          // Model not found under this make to add with this fitment
          await updateDoc(doc(this.firestore, 'vehicles_list', existing.id!), {
            model: [...existing.model, { name: model.name, fitments: [fitment] }]
          });

          alert(`Added ${make} - ${model.name} (${fitment.year})`);
        }
      } else {
        // No make to create new doc with this model + fitment
        await addDoc(collection(this.firestore, 'vehicles_list'), {
          make,
          model: [{ name: model.name, fitments: [fitment] }],
          createdAt: new Date()
        });

        alert(`Added ${make} - ${model.name} (${fitment.year})`);
      }

      await this.loadVehicles();
    } catch (err) {
      console.error(err);
      alert(`Failed to add ${make} - ${model.name} (${fitment.year})`);
    }
  }

  isModelImported(make: string, model: VehicleModel): boolean {
    const vehicle = this.vehicles.find(v => v.make.toLowerCase() === make.toLowerCase());
    return !!vehicle?.model.some(m => m.name.toLowerCase() === model.name.toLowerCase());
  }

  isFitmentImported(make: string, model: VehicleModel, fitment: Fitment): boolean {
    const vehicle = this.vehicles.find(v => v.make.toLowerCase() === make.toLowerCase());
    const existingModel = vehicle?.model.find(m => m.name.toLowerCase() === model.name.toLowerCase());
    const key = `${fitment.year}-${fitment.fuel}-${fitment.displacement}-${fitment.sizeClass}`;
    return !!existingModel?.fitments.some(f =>
      `${f.year}-${f.fuel}-${f.displacement}-${f.sizeClass}` === key
    );
  }

  // manually add vehicle to vehicle list tab4
  addModel() {

    if (this.brandSelectionType === 'existing') {
      if (!this.selectedMake) {
        alert('Please select an existing brand.');
        return;
      }
    } else if (this.brandSelectionType === 'new') {
      if (!this.newMakeRequest.trim()) {
        alert('Please enter a new brand name.');
        return;
      } else {
        const exists = this.vehicles.find(v => v.make.toLowerCase() === this.newMakeRequest.toLowerCase());
        if (exists) {
          alert(`Brand "${this.newMakeRequest}" already exists. Use "Existing Brand" option instead.`);
          return;
        }
      }
    } else {
      alert('Please select a brand selection type and provide a brand name before proceeding.');
      return;
    }
    this.newModels.push({
      name: '',
      fitments: [],
    });
  }

  removeModelInAddTab(index: number) {
    this.newModels.splice(index, 1);
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

  removeFitmentInAddTab(modelIndex: number, fitmentIndex: number) {
    this.newModels[modelIndex].fitments.splice(fitmentIndex, 1);
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

        if (!f.displacement || (Array.isArray(f.displacement) && f.displacement.length === 0)) {
          return `Fitment ${fIndex + 1} in model "${model.name}" is missing a displacement.`;
        } else if (isNaN(parseFloat(f.displacement)) || isNaN(parseFloat(f.sharedDisplacement))) {
          return `Fitment ${fIndex + 1} in model "${model.name}" has an invalid displacement.`;
        } else if (parseFloat(f.displacement) <= 0 || parseFloat(f.sharedDisplacement) <= 0 || parseFloat(f.displacement) > 12.9 || parseFloat(f.sharedDisplacement) > 12.9) {
          return `Fitment ${fIndex + 1} in model "${model.name}" has an invalid displacement volume.`;
        }

        if (!f.sharedSizeClass) {
          return `Fitment ${fIndex + 1} in model "${model.name}" is missing a size class.`;
        }
      }
    }
    return null;
  }

  private capitalizeFirstAlphabet(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  async addNewVehicleAttribute() {
    try {
      // Ensure at least one model is added
      if (this.newModels.length === 0) {
        alert('Please add at least one model.');
        return;
      }

      // Validate the new models before submission
      const validationError = this.validateNewModels();
      if (validationError) {
        alert(validationError);
        return;
      }

      // add a completely new brand
      if (this.brandSelectionType === 'new') {
        if (!this.newMakeRequest.trim()) {
          alert('Please enter a new brand name.');
          return;
        }

        // create models & fitments for ensure unique combinations
        const models: VehicleModel[] = this.newModels.map(model => {
          const uniqueFitments: Fitment[] = [];

          for (const fitmentData of model.fitments) {
            const fitment: Fitment = {
              year: fitmentData.year || '',
              fuel: fitmentData.sharedFuel || fitmentData.fuel || '-',
              displacement: fitmentData.sharedDisplacement || fitmentData.displacement || '',
              sizeClass: fitmentData.sharedSizeClass || fitmentData.sizeClass || '-',
              status: 'approved'
            };

            // use for deduplication
            const key = `${fitment.year}-${fitment.fuel}-${fitment.displacement}-${fitment.sizeClass}`;

            const alreadyExists = uniqueFitments.some(
              existing => `${existing.year}-${existing.fuel}-${existing.displacement}-${existing.sizeClass}` === key
            );

            if (!alreadyExists) {
              uniqueFitments.push(fitment);
            }
          }

          return { name: model.name, fitments: uniqueFitments };
        });

        // save new brand to db
        await addDoc(collection(this.firestore, 'vehicles_list'), {
          make: this.capitalizeFirstAlphabet(this.newMakeRequest),
          model: models,
          createdAt: new Date()
        });

        alert(`Added new brand: ${this.newMakeRequest}`);
      }

      // add models/fitments under an existing brand
      else if (this.brandSelectionType === 'existing') {
        if (!this.selectedMake) {
          alert('Please select an existing brand.');
          return;
        }

        // find brand in current vehicles list refer to db
        const selectedBrandDoc = this.vehicles.find(
          v => v.make.toLowerCase() === this.selectedMake.toLowerCase()
        );

        if (!selectedBrandDoc) {
          alert(`Selected brand "${this.selectedMake}" not found.`);
          return;
        }

        let updatedModels = [...selectedBrandDoc.model];
        let hasNewData = false;

        // process each new model
        for (const newModel of this.newModels) {
          const existingModel = updatedModels.find(
            m => m.name.toLowerCase() === newModel.name.toLowerCase()
          );

          if (existingModel) {
            // add only unique fitments to existing model
            for (const fitmentData of newModel.fitments) {
              const fitment: Fitment = {
                year: fitmentData.year || '',
                fuel: fitmentData.sharedFuel || fitmentData.fuel || '-',
                displacement: fitmentData.sharedDisplacement || fitmentData.displacement || '',
                sizeClass: fitmentData.sharedSizeClass || fitmentData.sizeClass || '-',
                status: 'approved'
              };

              const key = `${fitment.year}-${fitment.fuel}-${fitment.displacement}-${fitment.sizeClass}`;
              const alreadyExists = existingModel.fitments.some(
                existing => `${existing.year}-${existing.fuel}-${existing.displacement}-${existing.sizeClass}` === key
              );

              if (!alreadyExists) {
                existingModel.fitments.push(fitment);
                hasNewData = true;
              }
            }
          } else {
            // add a completely new model with its fitments
            const fitments: Fitment[] = newModel.fitments.map((f: any) => ({
              year: f.year || '',
              fuel: f.sharedFuel || f.fuel || '-',
              displacement: f.sharedDisplacement || f.displacement || '',
              sizeClass: f.sharedSizeClass || f.sizeClass || '-',
              status: 'approved'
            }));

            updatedModels.push({ name: newModel.name, fitments });
            hasNewData = true;
          }
        }

        // only update if there’s actually new data
        if (!hasNewData) {
          alert(`No new models/fitments to add for ${this.selectedMake}.`);
          return;
        }

        // save updates to db
        await updateDoc(doc(this.firestore, 'vehicles_list', selectedBrandDoc.id!), {
          model: updatedModels
        });

        alert(`Updated brand: ${this.selectedMake}`);
      }

      this.newMakeRequest = '';
      this.selectedMake = '';
      this.newModels = [];
      this.brandSelectionType = 'existing';

      await this.loadVehicles();

    } catch (err) {
      console.error(err);
      alert('Failed to submit new vehicle data.');
    }
  }
}

