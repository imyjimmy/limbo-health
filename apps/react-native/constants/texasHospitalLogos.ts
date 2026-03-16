import type { ImageSourcePropType } from 'react-native';

export type HospitalLogoFormat = 'svg' | 'bitmap';

export interface TexasHospitalLogo {
  id: string;
  systemName: string;
  asset: ImageSourcePropType;
  format: HospitalLogoFormat;
}

export const TEXAS_HOSPITAL_LOGOS: TexasHospitalLogo[] = [
  {
    id: 'baylor-scott-white',
    systemName: 'Baylor Scott & White Health',
    asset: require('../assets/hospital-logos/01-baylor-scott-and-white-health.svg'),
    format: 'svg',
  },
  {
    id: 'st-davids',
    systemName: "St. David's HealthCare",
    asset: require('../assets/hospital-logos/02-st-david-s-healthcare.svg'),
    format: 'svg',
  },
  {
    id: 'texas-health-resources',
    systemName: 'Texas Health Resources',
    asset: require('../assets/hospital-logos/03-texas-health-resources.svg'),
    format: 'svg',
  },
  {
    id: 'ut-southwestern',
    systemName: 'UT Southwestern Medical Center',
    asset: require('../assets/hospital-logos/04-ut-southwestern-medical-center.svg'),
    format: 'svg',
  },
  {
    id: 'methodist-health-system',
    systemName: 'Methodist Health System',
    asset: require('../assets/hospital-logos/05-methodist-health-system.png'),
    format: 'bitmap',
  },
  {
    id: 'houston-methodist',
    systemName: 'Houston Methodist',
    asset: require('../assets/hospital-logos/06-houston-methodist.svg'),
    format: 'svg',
  },
  {
    id: 'memorial-hermann',
    systemName: 'Memorial Hermann Health System',
    asset: require('../assets/hospital-logos/07-memorial-hermann-health-system.svg'),
    format: 'svg',
  },
  {
    id: 'ascension-seton',
    systemName: 'Ascension Seton',
    asset: require('../assets/hospital-logos/08-ascension-seton.png'),
    format: 'bitmap',
  },
  {
    id: 'tenet-healthcare',
    systemName: 'Tenet Healthcare',
    asset: require('../assets/hospital-logos/09-tenet-healthcare.png'),
    format: 'bitmap',
  },
  {
    id: 'christus-health',
    systemName: 'CHRISTUS Health',
    asset: require('../assets/hospital-logos/10-christus-health.svg'),
    format: 'svg',
  },
  {
    id: 'ernest-health',
    systemName: 'Ernest Health',
    asset: require('../assets/hospital-logos/11-ernest-health.svg'),
    format: 'svg',
  },
  {
    id: 'oceans-healthcare',
    systemName: 'Oceans Healthcare',
    asset: require('../assets/hospital-logos/12-oceans-healthcare.png'),
    format: 'bitmap',
  },
  {
    id: 'hca-medical-city',
    systemName: 'HCA Medical City Healthcare (North Texas Division)',
    asset: require('../assets/hospital-logos/13-hca-medical-city-healthcare-north-texas-division.svg'),
    format: 'svg',
  },
  {
    id: 'nutex-health',
    systemName: 'Nutex Health',
    asset: require('../assets/hospital-logos/14-nutex-health.png'),
    format: 'bitmap',
  },
  {
    id: 'baptist-sa',
    systemName: 'Baptist Health System (San Antonio)',
    asset: require('../assets/hospital-logos/15-baptist-health-system-san-antonio.png'),
    format: 'bitmap',
  },
  {
    id: 'chc',
    systemName: 'Community Hospital Corporation',
    asset: require('../assets/hospital-logos/16-community-hospital-corporation.png'),
    format: 'bitmap',
  },
  {
    id: 'nobis',
    systemName: 'Nobis Rehabilitation Partners',
    asset: require('../assets/hospital-logos/17-nobis-rehabilitation-partners.png'),
    format: 'bitmap',
  },
  {
    id: 'hca-san-antonio-division',
    systemName: 'HCA San Antonio Division (Methodist Healthcare of San Antonio)',
    asset: require('../assets/hospital-logos/18-hca-san-antonio-division-methodist-healthcare-of-san-antonio.svg'),
    format: 'svg',
  },
  {
    id: 'hca-gulf-coast-division',
    systemName: 'HCA Gulf Coast Division (HCA Houston Healthcare)',
    asset: require('../assets/hospital-logos/19-hca-gulf-coast-division-hca-houston-healthcare.svg'),
    format: 'svg',
  },
  {
    id: 'ut-health-east-texas',
    systemName: 'UT Health East Texas',
    asset: require('../assets/hospital-logos/21-ut-health-east-texas.png'),
    format: 'bitmap',
  },
  {
    id: 'chi-st-lukes',
    systemName: "CHI St. Luke's Health",
    asset: require('../assets/hospital-logos/22-chi-st-luke-s-health.svg'),
    format: 'svg',
  },
  {
    id: 'hospitals-of-providence',
    systemName: 'The Hospitals of Providence',
    asset: require('../assets/hospital-logos/23-the-hospitals-of-providence.png'),
    format: 'bitmap',
  },
  {
    id: 'exceptional-community-hospitals',
    systemName: 'Exceptional Community Hospitals',
    asset: require('../assets/hospital-logos/24-exceptional-community-hospitals.png'),
    format: 'bitmap',
  },
  {
    id: 'uspi',
    systemName: 'United Surgical Partners International (USPI)',
    asset: require('../assets/hospital-logos/25-united-surgical-partners-international-uspi.png'),
    format: 'bitmap',
  },
];
