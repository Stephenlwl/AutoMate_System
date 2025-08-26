import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { map, tap } from 'rxjs/operators';
import { Observable, combineLatest } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  firestore = inject(Firestore);
  loading = false;
  stats$!: Observable<any[]>;

  constructor() {
    this.loading = true;
    const carOwnersPending$ = collectionData(
      query(collection(this.firestore, 'car_owners'), where('verification.status', '==', 'pending'))
    ).pipe(map(data => ({ label: 'Car Owner Pending Accounts', value: data.length, icon: 'bi bi-person-check' })));

    const carRepairServiceCenterPending$ = collectionData(
       query(collection(this.firestore, 'service_centers'), where("verification.status", "==", "pending"))
    ).pipe(map(data => ({ label: 'Car Repair Service Center Pending Accounts', value: data.length, icon: 'bi bi-tools' })));

    const carRepairServiceCenterStuffPending$ = collectionData(
      query(collection(this.firestore, 'repair_service_center_staff'), where("verification.status", "==", "pending"))
    ).pipe(map(data => ({ label: 'Car Repair Service Center Staff Pending Accounts', value: data.length, icon: 'bi bi-people-fill' })));

    const carRepairServiceCenterTowingDriverPending$ = collectionData(
      query(collection(this.firestore, 'repair_service_center_towing_drivers'), where("verification.status", "==", "pending"))
    ).pipe(map(data => ({ label: 'Car Repair Service Center Towing Driver Pending Accounts', value: data.length, icon: 'bi bi-truck' })));

    const vehiclesPending$ = collectionData(
      query(collection(this.firestore, 'vehicles'), where('status', '==', 'pending'))
    ).pipe(map(data => ({ label: 'Pending Vehicles', value: data.length, icon: 'bi bi-car-front' })));

    const reviews$ = collectionData(
      query(collection(this.firestore, 'reviews'), where('status', '==', 'pending'))
    ).pipe(map(data => ({ label: 'Reviews to Moderate', value: data.length, icon: 'bi bi-chat-left-text' })));

    const payments$ = collectionData(
      query(collection(this.firestore, 'payments'), where('status', '==', 'on-hold'))
    ).pipe(map(data => ({ label: 'On-hold Payments', value: data.length, icon: 'bi bi-cash-coin' })));

    this.stats$ = combineLatest([carOwnersPending$, carRepairServiceCenterPending$, carRepairServiceCenterStuffPending$, carRepairServiceCenterTowingDriverPending$, vehiclesPending$, reviews$, payments$]).pipe(tap(() => this.loading = false));
  }
}
