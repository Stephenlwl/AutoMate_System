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

    const vehiclesPending$ = collectionData(
      collection(this.firestore, 'car_owners')
    ).pipe(map((carOwners: any[]) => {
      const pendingVehiclesCount = carOwners.reduce((count, carOwner) => {
        if (carOwner.vehicles && Array.isArray(carOwner.vehicles)) {
          const pendingVehicles = carOwner.vehicles.filter((vehicle: any) =>
            vehicle.status === 'pending'
          );
          return count + pendingVehicles.length;
        }
        return count;
      }, 0);

      return {
        label: 'Pending Vehicles',
        value: pendingVehiclesCount,
        icon: 'bi bi-car-front'
      };
    })
    );
    const reviews$ = collectionData(
      query(collection(this.firestore, 'reviews'), where('status', '==', 'approved'))
    ).pipe(map(data => ({ label: 'Reviews to Moderate', value: data.length, icon: 'bi bi-chat-left-text' })));


    this.stats$ = combineLatest([carOwnersPending$, carRepairServiceCenterPending$, vehiclesPending$, reviews$]).pipe(tap(() => this.loading = false));
  }
}
