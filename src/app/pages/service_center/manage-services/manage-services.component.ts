import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { HttpClientModule } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { AuthService } from '../auth/service-center-auth';

type Category = { id: string; name: string; description?: string; active: boolean };
type Service = { id: string; categoryId: string; name: string; description?: string; active: boolean };

@Component({
  selector: 'app-manage-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './manage-services.component.html'
})
export class ServiceCenterServiceComponent implements OnInit {
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  workshopId!: string;

  // master data
  categories$!: Observable<Category[]>;
  services$!: Observable<Service[]>;
  grouped$!: Observable<{ category: Category; services: Service[] }[]>;

  // form for selecting car + configuring services
  form!: FormGroup;

  loading = false;
  errorMessage = '';
  loadedVariantKey = ''; 

  ngOnInit(): void {
    this.workshopId = this.auth.getAdmin(); 

    this.form = this.fb.group({
      brand: ['', Validators.required],
      model: ['', Validators.required],
      year: [null, [Validators.required, Validators.min(1900)]],
      groups: this.fb.array([]) 
    });

    const catRef = collection(this.firestore, 'services_categories');
    this.categories$ = collectionData(catRef, { idField: 'id' }) as Observable<Category[]>;

    const svcRef = collection(this.firestore, 'services');
    this.services$ = collectionData(svcRef, { idField: 'id' }) as Observable<Service[]>;

    this.grouped$ = this.categories$.pipe(
      map(categories => {
        return categories
          .filter(c => c.active)
          .map(c => ({ category: c, services: [] as Service[] }));
      }),
    
    );
  }

  get groupsArray(): FormArray<FormGroup> {
    return this.form.get('groups') as FormArray<FormGroup>;
  }

  getServicesArray(group: FormGroup): FormArray<FormGroup> {
    return group.get('services') as FormArray<FormGroup>;
  }


  private serviceItemGroup(svc: Service, existing?: any) {
    return this.fb.group({
      categoryId: [svc.categoryId],
      serviceId: [svc.id],
      nameSnapshot: [svc.name],
      offer: [existing ? !!existing.active : false],
      price: [
        existing?.price ?? null,
        existing?.active
          ? [Validators.required, Validators.min(1)]
          : []
      ],
      duration: [
        existing?.duration ?? null,
        existing?.active
          ? [Validators.required, Validators.min(5)]
          : []
      ]
    });
  }

  private categoryGroup(cat: Category, serviceControls: FormGroup[]) {
    return this.fb.group({
      categoryId: [cat.id],
      categoryName: [cat.name],
      services: this.fb.array(serviceControls)
    });
  }

  async loadAndBuildForm() {
    this.errorMessage = '';
    this.groupsArray.clear();

    if (this.form.invalid) {
      this.errorMessage = 'Please fill brand, model and year.';
      return;
    }

    const { brand, model, year } = this.form.value;

    const categoriesSnap = await collectionData(collection(this.firestore, 'services_categories'), { idField: 'id' }).toPromise() as Category[];
    const servicesSnap = await collectionData(collection(this.firestore, 'services'), { idField: 'id' }).toPromise() as Service[];

    const activeCategories = (categoriesSnap || []).filter(c => c.active);
    const activeServices = (servicesSnap || []).filter(s => s.active);

    const variantId = `${brand}_${model}_${year}`.replace(/\s+/g, '_');
    this.loadedVariantKey = variantId;
    const ref = doc(this.firestore, `repair_service_centers/${this.workshopId}/services/${variantId}`);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as any) : null;
    const existingMap = new Map<string, any>();
    if (existing?.items?.length) {
      existing.items.forEach((it: any) => existingMap.set(it.serviceId, it));
    }

    activeCategories.forEach(cat => {
      const catServices = activeServices.filter(s => s.categoryId === cat.id);
      const svcCtrls = catServices.map(s => this.serviceItemGroup(s, existingMap.get(s.id)));

      this.groupsArray.push(this.categoryGroup(cat, svcCtrls));
    });
  }

  onToggleOffer(groupIndex: number, serviceIndex: number) {
    const servicesFA = (this.groupsArray.at(groupIndex).get('services') as FormArray);
    const svcFG = servicesFA.at(serviceIndex) as FormGroup;
    const offer = svcFG.get('offer')!.value as boolean;

    const priceCtrl = svcFG.get('price')!;
    const durationCtrl = svcFG.get('duration')!;

    priceCtrl.clearValidators();
    durationCtrl.clearValidators();
    if (offer) {
      priceCtrl.addValidators([Validators.required, Validators.min(1)]);
      durationCtrl.addValidators([Validators.required, Validators.min(5)]);
    }
    priceCtrl.updateValueAndValidity();
    durationCtrl.updateValueAndValidity();
  }

  private collectItemsToSave() {
    const items: any[] = [];
    this.groupsArray.controls.forEach(groupCtrl => {
      const servicesFA = groupCtrl.get('services') as FormArray;
      servicesFA.controls.forEach(svcCtrl => {
        const v = svcCtrl.value;
        items.push({
          categoryId: v.categoryId,
          serviceId: v.serviceId,
          nameSnapshot: v.nameSnapshot,
          active: !!v.offer,
          price: v.offer ? Number(v.price) : null,
          duration: v.offer ? Number(v.duration) : null
        });
      });
    });
    return items;
  }

  async save() {
    this.errorMessage = '';
    if (this.form.invalid) {
      this.errorMessage = 'Please complete brand, model, year.';
      return;
    }

    for (let gi = 0; gi < this.groupsArray.length; gi++) {
      const servicesFA = (this.groupsArray.at(gi).get('services') as FormArray);
      for (let si = 0; si < servicesFA.length; si++) {
        const svcFG = servicesFA.at(si) as FormGroup;
        const offer = svcFG.get('offer')!.value;
        if (offer && (svcFG.invalid || !svcFG.get('price')!.value || !svcFG.get('duration')!.value)) {
          this.errorMessage = 'Please enter price and duration for all offered services.';
          return;
        }
      }
    }

    const { brand, model, year } = this.form.value;
    const items = this.collectItemsToSave();

    const docId = this.loadedVariantKey || `${brand}_${model}_${year}`.replace(/\s+/g, '_');
    const ref = doc(this.firestore, `repair_service_centers/${this.workshopId}/services/${docId}`);

    try {
      this.loading = true;
      await setDoc(ref, {
        brand,
        model,
        year: Number(year),
        items
      }, { merge: true });

      alert('Services saved for this car variant.');
    } catch (e: any) {
      this.errorMessage = e.message;
    } finally {
      this.loading = false;
    }
  }
}
