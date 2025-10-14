import { Component, HostListener, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterModule, Router } from '@angular/router';
import { ServiceCenterSidebarComponent } from '../sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { TowingAlertService } from '../towing-alert.service';
import { ServiceBookingUrgentAlertService} from '../service-urgent-alert.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ServiceCenterSidebarComponent, CommonModule, RouterModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class ServiceCenterLayoutComponent implements OnDestroy {
  newTowingRequest: any | null = null;
  newServiceBookingUrgentRequest: any | null = null;
  showTowingRequestOverlay = false;
  showServiceBookingUrgentRequestOverlay = false;
  isCollapsed = false;
   private towingSubscription: Subscription;
  private serviceBookingSubscription: Subscription;

  constructor(
    private towingAlertService: TowingAlertService,
    private serviceBookingUrgentAlertService: ServiceBookingUrgentAlertService,
    private router: Router
  ) {
    this.towingSubscription = this.towingAlertService.getTowingRequestsStream().subscribe((data) => {
      if (data) {
        this.newTowingRequest = data;
        this.showTowingRequestOverlay = true;
        this.playAlertSound();
      }
    });
    this.serviceBookingSubscription =this.serviceBookingUrgentAlertService.getServiceBookingRequestsStream().subscribe((data) => {
      if (data) {
        this.newServiceBookingUrgentRequest = data;
        this.showServiceBookingUrgentRequestOverlay = true;
        this.playAlertSound();
      }
    });
  }

  ngOnInit() {
    this.updateSidebarState();
  }

  playAlertSound() {
    console.log('Attempting to play alert sound...');
    const audioPaths = '/alert.mp3';

    this.tryAudioPaths(audioPaths);
  }

  private async tryAudioPaths(path: string): Promise<boolean> {
    const success = await this.tryPlayAudio(path);
    if (success) {
      return true;
    }
    return false;
  }

  private async tryPlayAudio(audioPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const audio = new Audio(audioPath);

      // Set a timeout to avoid hanging
      const timeoutId = setTimeout(() => {
        console.log('Audio load timeout for:', audioPath);
        resolve(false);
      }, 3000);

      audio.addEventListener('canplaythrough', () => {
        clearTimeout(timeoutId);
        console.log('Audio can play:', audioPath);
        audio.volume = 0.3;
        audio.play().then(() => {
          console.log('Audio played successfully:', audioPath);
          resolve(true);
        }).catch(e => {
          console.log('Audio play failed for', audioPath, e);
          resolve(false);
        });
      });

      audio.addEventListener('error', (e) => {
        clearTimeout(timeoutId);
        console.log('Audio load error for', audioPath, e);
        resolve(false);
      });

      // Start loading the audio
      audio.load();
    });
  }

  closeTowingRequestOverlay() {
    this.showTowingRequestOverlay = false;
    this.newTowingRequest = null;
  }

  closeServiceBookingUrgentRequestOverlay() {
    this.showServiceBookingUrgentRequestOverlay = false;
    this.newServiceBookingUrgentRequest = null;
  }

  viewTowingRequest() {
    console.log('View towing request:', this.newTowingRequest);
    this.closeTowingRequestOverlay();

    this.router.navigate(['/serviceCenter/manage-towing-bookings'])
  }

  viewServiceBookingUrgentRequest() {
    console.log('View service booking urgent request:', this.newServiceBookingUrgentRequest);
    this.closeServiceBookingUrgentRequestOverlay();
    this.router.navigate(['/serviceCenter/manage-service-bookings'])
  }

  @HostListener('window:resize', [])
  onResize() {
    this.updateSidebarState();
  }

  private updateSidebarState() {
    this.isCollapsed = window.innerWidth <= 768;
  }

  ngOnDestroy() {
    if (this.towingSubscription) {
      this.towingSubscription.unsubscribe();
    }
    if (this.serviceBookingSubscription) {
      this.serviceBookingSubscription.unsubscribe();
    }
  }
}