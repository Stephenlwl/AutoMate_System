import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { SignupComponent } from './auth/signup/signup.component';
import { DashboardComponent } from './pages/system_admin/dashboard/dashboard.component';
import { LayoutComponent } from './pages/system_admin/layout/layout.component'; 
import { ValidateUserAccountsComponent } from './pages/system_admin/validate-user-accounts/validate-user-accounts.component';
import { ValidateServiceCenterAdminComponent } from './pages/system_admin/validate-service-center-admin/validate-service-center-admin.component';
import { ValidateServiceCenterStaffComponent } from './pages/system_admin/validate-service-center-staff/validate-service-center-staff.component';
import { ValidateServiceCenterTowingDriverComponent } from './pages/system_admin/validate-service-center-towing-driver/validate-service-center-towing-driver.component';
import { VerifyVehiclesComponent } from './pages/system_admin/verify-vehicles/verify-vehicles.component';
import { ManageReviewComponent } from './pages/system_admin/manage-review/manage-review.component';
import { ManageServicesComponent } from './pages/system_admin/manage-services/manage-services.component';
import { ManagePaymentComponent } from './pages/system_admin/manage-payment/manage-payment.component';
import { ManageChatComponent } from './pages/system_admin/manage-chat/manage-chat.component';
import { ServiceCenterLoginComponent } from './pages/service_center/service-center-login/service-center-login.component';
import { ServiceCenterSignupComponent } from './pages/service_center/service-center-signup/service-center-signup.component';

import { ServiceCenterAuthGuard } from './pages/service_center/auth/service-center-auth-guard';
import { ServiceCenterLayoutComponent } from './pages/service_center/layout/layout.component';
import { ServiceCenterDashboardComponent } from './pages/service_center/dashboard/dashboard.component';
import { ManageBookingsComponent } from './pages/service_center/manage-bookings/manage-bookings.component';
import { ManageBaysComponent } from './pages/service_center/manage-bays/manage-bays.component';
import { ServiceCenterServiceComponent } from './pages/service_center/manage-services/manage-services.component';
import { ManageTowingServicesComponent } from './pages/service_center/manage-towing-services/manage-towing-services.component';
import { ServiceCenterPaymentsComponent } from './pages/service_center/manage-payments/manage-payments.component';
import { ServiceCenterChatComponent } from './pages/service_center/chat-support/chat-support.component';
import { ServiceCenterDetailsComponent } from './pages/service_center/service-center-details/service-center-details.component';
import { ServiceCenterProfileComponent } from './pages/service_center/profile/profile.component';
import { ManageStaffTowingDriverComponent } from './pages/service_center/manage-staff-towing-driver/manage-staff-towing-driver.component';

export const routes: Routes = [
  { path: 'systemAdmin/login', component: LoginComponent },
  { path: 'systemAdmin/signup', component: SignupComponent },
  { path: 'serviceCenter/login', component: ServiceCenterLoginComponent },
  { path: 'serviceCenter/signup', component: ServiceCenterSignupComponent },

  {
    path: 'systemAdmin',
    component: LayoutComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'validate-user-accounts', component: ValidateUserAccountsComponent },
      { path: 'validate-service-center-admin', component: ValidateServiceCenterAdminComponent },
      { path: 'validate-service-center-staff', component: ValidateServiceCenterStaffComponent },
      { path: 'validate-towing-driver', component: ValidateServiceCenterTowingDriverComponent },
      { path: 'verify-vehicles', component: VerifyVehiclesComponent },
      { path: 'manage-review', component: ManageReviewComponent },
      { path: 'manage-services', component: ManageServicesComponent},
      { path: 'manage-payment', component: ManagePaymentComponent },
      { path: 'manage-chat', component: ManageChatComponent },
    ]
  },

   {
    path: 'serviceCenter',
    component: ServiceCenterLayoutComponent,
    canActivate: [ServiceCenterAuthGuard],
    children: [
      { path: 'dashboard', component: ServiceCenterDashboardComponent },
      { path: 'manage-bookings', component: ManageBookingsComponent },
      { path: 'manage-bays', component: ManageBaysComponent },
      { path: 'manage-services', component: ServiceCenterServiceComponent },
      { path: 'manage-towing-services', component: ManageTowingServicesComponent },
      { path: 'manage-payments', component: ServiceCenterPaymentsComponent },
      { path: 'chat-support', component: ServiceCenterChatComponent },
      { path: 'service-center-details', component: ServiceCenterDetailsComponent },
      { path: 'profile', component: ServiceCenterProfileComponent },
      { path: 'manage-staff-towing-driver', component: ManageStaffTowingDriverComponent },
    ]
  },

  { path: '', redirectTo: 'systemAdmin/login', pathMatch: 'full' },
  { path: '**', redirectTo: 'systemAdmin/login' }
];
