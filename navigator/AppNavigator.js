import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from '../Screens/Home';
import FullBlur from '../Screens/FullBlur';
import SpotBlur from '../Screens/SpotBlur';
import ImageToPdf from '../Screens/ImageToPdf';
import ImageCompressor from '../Screens/ImageCompressor';
import ImageFormatConverter from '../Screens/ImageFormatConverter';
import VideoCompressor from '../Screens/VideoCompressor';
import AudioCompressor from '../Screens/AudioCompressor';
import AudioTrimmer from '../Screens/AudioTrimmer';
import CameraToText from '../Screens/CameraToText';
import TextToSpeech from '../Screens/TextToSpeech';
import QRCodeTools from '../Screens/QRCodeTools';
import VideoToAudio from '../Screens/VideoToAudio';
import PDFTools from '../Screens/PDFTools';
import MergePDF from '../Screens/MergePDF';
import SplitPDF from '../Screens/SplitPDF';
import ExtractPDF from '../Screens/ExtractPDF';
import LockUnlockPDF from '../Screens/LockUnlockPDF';
import PdfToJpg from '../Screens/PdfToJpg';
import TextToPDF from '../Screens/TextToPDF';
import ShowPDF from '../Screens/ShowPDF';
import ZipTools from '../Screens/ZipTools';
import ZipWithPassword from '../Screens/ZipWithPassword';
import UnzipLockedZip from '../Screens/UnzipLockedZip';
import LockZip from '../Screens/LockZip';
import GifMaker from '../Screens/GifMaker';
import ImageColorPicker from '../Screens/ImageColorPicker';
import ImageBlur from '../Screens/ImageBlur';
import WallpaperBlur from '../Screens/WallpaperBlur';
import AudioMerger from '../Screens/AudioMerger';
import AudioTools from '../Screens/AudioTools';
import VideoTools from '../Screens/VideoTools';
import ImageTools from '../Screens/ImageTools';
import CameraTools from '../Screens/CameraTools';
import Flashlight from '../Screens/Flashlight';
import VideoConverter from '../Screens/VideoConverter';
import AppCacheManager from '../Screens/AppCacheManager';
import PDFEditor from '../Screens/PDFEditor';
import BGRemover from '../Screens/BGRemover';
import ImageLab from '../Screens/ImageLab';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="FullBlur" component={FullBlur} />
      <Stack.Screen name="SpotBlur" component={SpotBlur} />
      <Stack.Screen name="ImageToPdf" component={ImageToPdf} />
      <Stack.Screen name="ImageCompressor" component={ImageCompressor} />
      <Stack.Screen name="VideoCompressor" component={VideoCompressor} />
      <Stack.Screen name="AudioCompressor" component={AudioCompressor} />
      <Stack.Screen name="AudioTrimmer" component={AudioTrimmer} />
      <Stack.Screen name="ImageFormatConverter" component={ImageFormatConverter} />
      <Stack.Screen name="CameraToText" component={CameraToText} />
      <Stack.Screen name="TextToSpeech" component={TextToSpeech} />
      <Stack.Screen name="QRCodeTools" component={QRCodeTools} />
      <Stack.Screen name="VideoToAudio" component={VideoToAudio} />
      <Stack.Screen name="PDFTools" component={PDFTools} />
      <Stack.Screen name="MergePDF" component={MergePDF} />
      <Stack.Screen name="SplitPDF" component={SplitPDF} />
      <Stack.Screen name="ExtractPDF" component={ExtractPDF} />
      <Stack.Screen name="LockUnlockPDF" component={LockUnlockPDF} />
      <Stack.Screen name="PdfToJpg" component={PdfToJpg} />
      <Stack.Screen name="TextToPDF" component={TextToPDF} />
      <Stack.Screen name="ShowPDF" component={ShowPDF} />
      <Stack.Screen name="ZipTools" component={ZipTools} />
      <Stack.Screen name="ZipWithPassword" component={ZipWithPassword} />
      <Stack.Screen name="UnzipLockedZip" component={UnzipLockedZip} />
      <Stack.Screen name="LockZip" component={LockZip} />
      <Stack.Screen name="GifMaker" component={GifMaker} />
      <Stack.Screen name="ImageColorPicker" component={ImageColorPicker} />
      <Stack.Screen name="ImageBlur" component={ImageBlur} />
      <Stack.Screen name="WallpaperBlur" component={WallpaperBlur} />
      <Stack.Screen name="AudioMerger" component={AudioMerger} />
      <Stack.Screen name="AudioTools" component={AudioTools} />
      <Stack.Screen name="VideoTools" component={VideoTools} />
      <Stack.Screen name="ImageTools" component={ImageTools} />
      <Stack.Screen name="CameraTools" component={CameraTools} />
      <Stack.Screen name="Flashlight" component={Flashlight} />
      <Stack.Screen name="VideoConverter" component={VideoConverter} />
      <Stack.Screen name="AppCacheManager" component={AppCacheManager} />
      <Stack.Screen name="PDFEditor" component={PDFEditor} />
      <Stack.Screen name="BGRemover" component={BGRemover} />
      <Stack.Screen name="ImageLab" component={ImageLab} />
    </Stack.Navigator> 
  );
};

export default AppNavigator;
