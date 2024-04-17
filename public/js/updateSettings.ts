/* eslint-disable */
import { showAlert } from './alerts';
import axios from 'axios';

type Settings = 'userInfo' | 'password';
type UserInfoProps = {
  email: string;
  name: string;
};
type PasswordProps = {
  newPassword: string;
  oldPassword: string;
  passwordConfirm: string;
};
export type Data = UserInfoProps | PasswordProps | FormData;

export const updateSettings = async (data: Data, type: Settings) => {
  try {
    console.log(data, 'data');

    const {
      data: { status },
    } = await axios({
      method: 'PATCH',
      url: `http://localhost:8000/api/v1/users/${
        type === 'userInfo' ? 'updateCurrentUser' : 'updatePassword'
      }`,
      data: data,
    });

    if (status === 'success') {
      showAlert(status, `Successfully updated!`);
    }
  } catch (err) {
    showAlert('error', err.response.data.message);
  }
};
