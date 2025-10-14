import { Injectable, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, collection, onSnapshot, query, orderBy, where, Timestamp, doc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../service_center/auth/service-center-auth';

@Injectable({ providedIn: 'root' })
export class TowingAlertService {
    private towingRequests$ = new BehaviorSubject<any | null>(null);
    private lastRequestTime: Date | null = null;
    private serviceCenterId: string | null = null;

    constructor(
        private firestore: Firestore,
        private ngZone: NgZone,
        @Inject(PLATFORM_ID) private platformId: any,
        private auth: AuthService
    ) {
        this.initializeService();
    }

    private async initializeService() {
        if (isPlatformBrowser(this.platformId)) {
            // Get service center id from localStorage
            await this.getServiceCenterId();
            this.listenForTowingRequests();
        }
    }

    private async getServiceCenterId() {
        try {
            const serviceCenterData = localStorage.getItem('serviceCenterData');
            if (serviceCenterData) {
                const data = JSON.parse(serviceCenterData);
                this.serviceCenterId = data.id || data.serviceCenterId;
                console.log('Service Center ID:', this.serviceCenterId);
            }

            if (!this.serviceCenterId) {
                this.serviceCenterId = this.auth.getServiceCenterId();
            }
        } catch (error) {
            console.error('Error getting service center ID:', error);
        }
    }

    private listenForTowingRequests() {
        if (!this.serviceCenterId) {
            console.error('Service Center ID not available. Cannot listen for towing requests.');
            return;
        }

        // Set initial time to now so only get requests after this point
        this.lastRequestTime = new Date();

        const towingRef = collection(this.firestore, 'towing_requests');
        const towingQuery = query(
            towingRef,
            where('serviceCenterId', '==', this.serviceCenterId),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        onSnapshot(towingQuery, async (snapshot) => {
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const requestId = change.doc.id;
                    const requestTime = data['createdAt']?.toDate();

                    if (this.isNewRequest(requestTime)) {
                        console.log('New towing request detected:', requestId);

                        // Fetch customer details using userId
                        const customerDetails = await this.getCustomerDetails(data['userId']);

                        const enhancedData = {
                            ...data,
                            id: requestId,
                            createdAt: requestTime,
                            customerDetails: customerDetails 
                        };

                        this.ngZone.run(() => {
                            this.towingRequests$.next(enhancedData);
                            this.lastRequestTime = new Date();
                        });
                    }
                }
            }
        }, (error) => {
            console.error('Error listening to towing requests:', error);
        });
    }

    private async getCustomerDetails(userId: string): Promise<any> {

        try {
            const carOwnerDoc = doc(this.firestore, 'car_owners', userId);
            const carOwnerSnapshot = await getDoc(carOwnerDoc);

            if (carOwnerSnapshot.exists()) {
                const carOwnerData = carOwnerSnapshot.data();
                console.log('Fetched customer details:', carOwnerData);

                return {
                    name: carOwnerData['name'],
                    email: carOwnerData['email'],
                    phone: carOwnerData['phone']
                };
            }
        } catch (error) {
            console.error('Error fetching customer details:', error);
        }
    }

    private isNewRequest(requestTime: Date | null): boolean {
        if (!requestTime || !this.lastRequestTime) {
            return true; // If no previous time, show all requests
        }

        // Only show requests that were created after the last check
        return requestTime > this.lastRequestTime;
    }

    getTowingRequestsStream() {
        return this.towingRequests$.asObservable();
    }

    // Method to manually set service center id if needed
    setServiceCenterId(id: string) {
        this.serviceCenterId = id;
        this.lastRequestTime = new Date(); // Reset time when service center changes
        this.listenForTowingRequests();
    }

    // Method to reset last request time
    resetLastRequestTime() {
        this.lastRequestTime = new Date();
    }
}