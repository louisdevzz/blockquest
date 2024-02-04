import { yupResolver } from '@hookform/resolvers/yup';
import React, { useEffect ,useState } from 'react';
import { useForm } from 'react-hook-form';
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { useNavigate, useRoutes, useSearchParams } from 'react-router-dom';
import * as yup from 'yup';
import { LoginWrapper } from './LoginWithSocialAuth.style';
import { Button } from '../../lib/Button';
import Input from '../../lib/Input/Input';
import { createNEARAccount } from '../../api';
import FirestoreController from '../../lib/firestoreController';
import { actionCreators } from "@near-js/transactions";
import { basePath, network, networkId } from '../../utils/config';
import { captureException } from '@sentry/react';
import { KeyPair } from 'near-api-js';
import { InMemoryKeyStore } from "@near-js/keystores";
import { JsonRpcProvider } from '@near-js/providers';
import type { KeyStore } from '@near-js/keystores';
import { Account } from '@near-js/accounts';
import { InMemorySigner } from '@near-js/signers';
import {
  getAddKeyAction, getAddLAKAction , syncProfile
} from '../../utils/mpc-service';
import FastAuthController from '../../lib/controller';
import BN from 'bn.js';
import { openToast } from '../../lib/Toast';
import { checkFirestoreReady, firebaseAuth } from '../../utils/firebase';
import { useAuthState } from '../../lib/useAuthState';
// Initialize Firebase Auth provider
const provider = new GoogleAuthProvider();
import { createKey, isPassKeyAvailable } from '@near-js/biometric-ed25519';
// whenever a user interacts with the provider, we force them to select an account
provider.setCustomParameters({   
    prompt : "select_account"
});
export const signInWithGooglePopup = () => signInWithPopup(firebaseAuth, provider);


const onCreateAccount = async ({
  oidcKeypair,
  accessToken,
  accountId,
  publicKeyFak,
  public_key_lak,
  contract_id,
  methodNames,
  success_url,
  setStatusMessage,
  email,
  gateway,
  navigate
}) => {
  await createNEARAccount({
    accountId,
    fullAccessKeys:    publicKeyFak ? [publicKeyFak] : [],
    limitedAccessKeys: public_key_lak ? [{
      public_key:   public_key_lak,
      receiver_id:  contract_id,
      allowance:    '250000000000000',
      method_names: methodNames ?? '',
    }] : [],
    accessToken,
    oidcKeypair,
  });

  // if (res.type === 'err'){
  //   throw Error("Error res")   
  // };
  if (!window.firestoreController) {
    window.firestoreController = new FirestoreController();
  }
    await onSignIn({
      accessToken,
      publicKeyFak,
      public_key_lak,
      contract_id,
      methodNames,
      setStatusMessage,
      email,
      gateway,
      navigate
    })
  };
  
  
  //const recoveryPK = await window.fastAuthController.getUserCredential(accessToken);
  // const parsedUrl = new URL(
  //   success_url && isUrlNotJavascriptProtocol(success_url)
  //     ? success_url
  //     : window.location.origin + (basePath ? `/${basePath}` : '')
  // );
  // parsedUrl.searchParams.set('account_id', res.near_account_id);
  // parsedUrl.searchParams.set('public_key', public_key_lak);
  // parsedUrl.searchParams.set('all_keys', (publicKeyFak ? [public_key_lak, publicKeyFak, recoveryPK] : [public_key_lak, recoveryPK]).join(','));

  // window.location.replace(parsedUrl.href);
  
};

export const onSignIn = async ({
  accessToken,
  publicKeyFak,
  public_key_lak,
  contract_id,
  methodNames,
  setStatusMessage,
  email,
  gateway,
  navigate,
}) => {
  
  const recoveryPK = await window.fastAuthController.getUserCredential(accessToken);
  const accountIds = await fetch(`${network.fastAuth.authHelperUrl}/publicKey/${recoveryPK}/accounts`)
    .then((res) => res.json())
    .catch((err) => {
      console.log(err);
      captureException(err);
      throw new Error('Unable to retrieve account Id');
    });


  if (!accountIds.length) {
    //creat wallet here
    throw new Error('Account not found, please create an account and try again');
  }
  // TODO: If we want to remove old LAK automatically, use below code and add deleteKeyActions to signAndSendActionsWithRecoveryKey
  // const existingDevice = await window.firestoreController.getDeviceCollection(publicKeyFak);
  // // delete old lak key attached to webAuthN public Key
  // const deleteKeyActions = existingDevice
  //   ? getDeleteKeysAction(existingDevice.publicKeys.filter((key) => key !== publicKeyFak)) : [];


   // onlyAddLak will be true if current browser already has a FAK with passkey
   const onlyAddLak = !publicKeyFak || publicKeyFak === 'null';
   const addKeyActions = onlyAddLak
     ? getAddLAKAction({
       publicKeyLak: public_key_lak,
       contractId:   contract_id,
       methodNames,
       allowance:    new BN('250000000000000'),
     }) : getAddKeyAction({
       publicKeyLak:      public_key_lak,
       webAuthNPublicKey: publicKeyFak,
       contractId:        contract_id,
       methodNames,
       allowance:         new BN('250000000000000'),
     });
 
   return (window as any).fastAuthController.signAndSendActionsWithRecoveryKey({
     oidcToken: accessToken,
     accountId: accountIds[0],
     recoveryPK,
     actions:   addKeyActions
   })
     .then((res) => res.json())
     .then(async (res) => {
       const failure = res['Receipts Outcome']
         .find(({ outcome: { status } }) => Object.keys(status).some((k) => k === 'Failure'))?.outcome?.status?.Failure;
       if (failure?.ActionError?.kind?.LackBalanceForState) {
         //navigate(`/devices?${searchParams.toString()}`);
       } else {
         await checkFirestoreReady();
         if (!window.firestoreController) {
           (window as any).firestoreController = new FirestoreController();
         }
         await window.firestoreController.addDeviceCollection({
           fakPublicKey: onlyAddLak ? null : publicKeyFak,
           lakPublicKey: public_key_lak,
           gateway,
         });
 
         setStatusMessage('Account recovered successfully!');
 
         if (publicKeyFak) {
           window.localStorage.setItem('webauthn_username', email);
         }
         const syncActions = syncProfile({
          accountId:   "",
          accountName: "",
          accountUser:        "",
          accountPicProfile : ""
        });
   

        (window as any).fastAuthController.signAndSendActionsWithRecoveryKey({
          oidcToken: accessToken,
          accountId: accountIds[0],
          recoveryPK,
          actions: syncActions
        })
          .then((res) => res.json())
          .then(async (res) => {
            setStatusMessage('done');
          })

         
       }
     });
};

const checkIsAccountAvailable = async (desiredUsername: string): Promise<boolean> => {
  try {
    const response = await fetch(network.nodeUrl, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id:      'dontcare',
        method:  'query',
        params:  {
          request_type: 'view_account',
          finality:     'final',
          account_id:   `${desiredUsername}`,
        },
      }),
    });
    const data = await response.json();
    if (data?.error?.cause?.name === 'UNKNOWN_ACCOUNT') {
      return true;
    }

    if (data?.result?.code_hash) {
      return false;
    }

    return false;
  } catch (error: any) {
    console.log(error);
    openToast({
      title: error.message,
      type:  'ERROR'
    });
    return false;
  }
};


const schema = yup.object().shape({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Please enter a valid email address'),
});

export const connect = async (accountId: string, keyStore: KeyStore, network = 'mainnet'): Promise<Account> => {
  const provider = new JsonRpcProvider({
    url: network == 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org',
  });

  const signer = new InMemorySigner(keyStore);

  return new Account(
    {
      networkId: network,
      provider,
      signer,
      jsvmAccountId: '',
    },
    accountId,
  );
};

const instatiateAccount = async (network: string, accountName: string, pk: string) => {
  const relayerKeyStore = await authenticatedKeyStore(network, accountName, pk);

  return await connect(accountName, relayerKeyStore, network);
};
const authenticatedKeyStore = async (network: string, account: string, pk: string): Promise<KeyStore> => {
  const keyStore = new InMemoryKeyStore();
  await keyStore.setKey(network, account, KeyPair.fromString(pk));

  return keyStore;
};

function LoginWithSocialAuth() {
  const navigate = useNavigate();
  const { authenticated } = useAuthState();
  const [statusMessage, setStatusMessage] = useState<any>(authenticated&&"");
  const logout = async () => {
    await firebaseAuth.signOut();
    // once it has email but not authenicated, it means existing passkey is not valid anymore, therefore remove webauthn_username and try to create a new passkey
    window.localStorage.removeItem('webauthn_username');
    window.fastAuthController.clearUser().then(() => {
    });
    navigate(0)
  }


  const signInWithGoogle = async () => {
    try {
      const {user} = await signInWithGooglePopup();
      if (!user || !user.emailVerified) return;
  
      const accessToken = await user.getIdToken();
      let publicKeyFak: string;
      const keyPair = KeyPair.fromRandom('ed25519');
      publicKeyFak = keyPair.getPublicKey().toString();
      const email = user.email;
      //console.log("accesstoken",accessToken)
      const success_url = window.location.origin;
      let accountId = "" // user.email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`) ;
      const methodNames = "set";
      const contract_id = "v1.social08.testnet"
      const public_key_lak = null;
      let isRecovery = true;
      const oidcKeypair = await window.fastAuthController.getKey(`oidc_keypair_${accessToken}`);
      //console.log("acc",accountId)
      const accountIds = await fetch(`${network.fastAuth.authHelperUrl}/publicKey/${publicKeyFak}/accounts`)
        .then((res) => res.json())
        .catch((err) => {
          console.log(err);
          captureException(err);
          throw new Error('Unable to retrieve account Id');
        });
       if (!accountIds.length) {
        isRecovery = false
       }
       if(isRecovery){
        accountId = accountIds[0]
        
       }
       if(!isRecovery){
        //check exist account . if not exist then create . if exist create another account
        const isAvailable = await checkIsAccountAvailable(user.email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`));
        if(isAvailable){
          accountId = user.email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`)
        }else{
          const accountId = user.email.replace("@gmail.com",publicKeyFak.replace("ed25519:","").slice(0,4).toLocaleLowerCase()) ;
        }
        
       }
      // if account in mpc then recovery 
      // if account not exist then create new account
      if(isRecovery){
        await onSignIn(
          {
            accessToken,
            publicKeyFak,
            public_key_lak,
            contract_id,
            methodNames,
            setStatusMessage,
            email,
            navigate,
            gateway:success_url,
          }
        )
      }else{
        await  onCreateAccount(
          {
            oidcKeypair,
            accessToken,
            accountId,
            publicKeyFak,
            public_key_lak,
            contract_id,
            methodNames,
            success_url,
            setStatusMessage,
            email,
            navigate,
            gateway:success_url,
          }
        )
      }


  
    } catch (error) {
      console.log('error', error);
      captureException(error);
    }
   
  }

  return (
    <LoginWrapper>
      <div >
        <header>
          <h1 data-test-id="heading_login">Log In With Google</h1>
        </header>
        {authenticated ? 
        (
        <div>
        <h3 className='text-2xl font-semibold'>signed in</h3>
        <button className='px-4 py-2 border flex gap-2 border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:shadow transition duration-150' onClick={logout}>Logout</button>
        </div>
        )
        
        : <div className="flex items-center justify-center h-screen dark:bg-gray-800">
              <button onClick={signInWithGoogle} className="px-4 py-2 border flex gap-2 border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:shadow transition duration-150">
                  <span>Login with Google</span>
              </button>
          </div>
        
        }
        
        <div data-test-id="callback-status-message">{statusMessage}</div>
      </div>
    </LoginWrapper>
  );
}

export default LoginWithSocialAuth;
