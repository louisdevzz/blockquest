import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams ,useNavigate } from "react-router-dom";
import { useAuthState } from '../../lib/useAuthState';
import { checkFirestoreReady, firebaseAuth } from '../../utils/firebase';
import { getAuth, signInWithPopup, GoogleAuthProvider,TwitterAuthProvider, signOut } from "firebase/auth";
import { createNEARAccount } from '../../api';
import FirestoreController from '../../lib/firestoreController';
import { basePath, network, networkId } from '../../utils/config';
import { captureException } from '@sentry/react';
import { KeyPair } from 'near-api-js';
import { openToast } from '../../lib/Toast';
import FastAuthController from '../../lib/controller';

import BN from 'bn.js';

import {
    getAddKeyAction, getAddLAKAction , syncProfile
  } from '../../utils/mpc-service';

const {
  functionCall
  } = actionCreators;
  import { actionCreators } from "@near-js/transactions";
// Initialize Firebase Auth provider
const provider = new GoogleAuthProvider();
const providerTwiiter = new TwitterAuthProvider();
export const signInWithGooglePopup = () => signInWithPopup(firebaseAuth, provider);
export const signInWithTwitterPopup = () => signInWithPopup(firebaseAuth, providerTwiiter)



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
    const res = await createNEARAccount({
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
    console.log("res.type",res)
    if (res.type === 'err') return;
  
    if (!window.firestoreController) {
      window.firestoreController = new FirestoreController();
    }
  
    // Add device
    await window.firestoreController.addDeviceCollection({
      fakPublicKey: publicKeyFak,
      lakPublicKey: public_key_lak,
      gateway,
    });
  
    setStatusMessage('Account created successfully!');
  
    // TODO: Check if account ID matches the one from email
  
    if (publicKeyFak) {
      window.localStorage.setItem('webauthn_username', email);
    }
  
    setStatusMessage('Redirecting to app...');
  
    const recoveryPK = await window.fastAuthController.getUserCredential(accessToken);
  
      await onSignIn({
        accessToken,
        publicKeyFak,
        public_key_lak : recoveryPK,
        contract_id,
        methodNames,
        setStatusMessage,
        email,
        gateway,
        navigate,
        accountId,
        recoveryPK
      })
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
    accountId,
    recoveryPK
  }) => {
  
     const onlyAddLak = !publicKeyFak || publicKeyFak === 'null';
     console.log("onlyAddLak",onlyAddLak)
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
  
     await (window as any).fastAuthController.signAndSendActionsWithRecoveryKey({
       oidcToken: accessToken,
       accountId,
       recoveryPK,
       actions:   addKeyActions
     })
       .then((res) => res.json())
       .then(async (res) => {
         const failure = res['Receipts Outcome']
           .find(({ outcome: { status } }) => Object.keys(status).some((k) => k === 'Failure'))?.outcome?.status?.Failure;
         if (failure?.ActionError?.kind?.LackBalanceForState) {
  
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
           window.location.reload();
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
  
  

  
  
  
export default function Post(){
    const [searchParams] = useSearchParams();
    const [data, setData] = useState([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [link, setLink] = useState([]);
    const [amount, setAmount] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [backgroundCover, setBackgroundCover] = useState("");
    const [loading, setLoading] = useState(false);
    const { authenticated } = useAuthState();
    const mission_id = searchParams.get("mission_id")
    const [statusMessage, setStatusMessage] = useState<any>("");
    
    const navigate = useNavigate();

    const signIn = async (authType) => {
        try {
          const {user} = authType == "google" ? await signInWithGooglePopup() : await signInWithTwitterPopup();
          if (!user || !user.emailVerified) return;
      
          const accessToken = await user.getIdToken();
          
          const email = user.email;
          const success_url = window.location.origin;
      
          //check accounts
          let accountId = window.fastAuthController.getAccountId()
          console.log("accountId",accountId)
          const methodNames = "set";
          const contract_id = "v1.social08.testnet"
          let isRecovery = true;
      
          
        
      
          // claim the oidc token
          window.fastAuthController = new FastAuthController({
            accountId,
            networkId
          });
          
      
          let publicKeyFak: string;
          let public_key_lak : string;
          
          
            const keyPair =  KeyPair.fromRandom('ed25519');
            publicKeyFak = keyPair.getPublicKey().toString();
            await window.fastAuthController.setKey(keyPair);
          
      
          if (!window.fastAuthController.getAccountId()) {
            isRecovery = false
            const isAvailable = await checkIsAccountAvailable(user.email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`));
            if(isAvailable){
              accountId = user.email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`)
            }else{
              accountId = user.email.replace("@gmail.com",publicKeyFak.replace("ed25519:","").slice(0,4).toLocaleLowerCase()) ;
            }
            await window.fastAuthController.setAccountId(accountId);
          }
      
          await window.fastAuthController.claimOidcToken(accessToken);
          const oidcKeypair = await window.fastAuthController.getKey(`oidc_keypair_${accessToken}`);
          window.firestoreController = new FirestoreController();
          window.firestoreController.updateUser({
            userUid:   user.uid,
            oidcToken: accessToken,
          });
          // if account in mpc then recovery 
          // if account not exist then create new account
          const recoveryPK = await window.fastAuthController.getUserCredential(accessToken);
      
          const accountIds = await fetch(`${network.fastAuth.authHelperUrl}/publicKey/${recoveryPK}/accounts`)
            .then((res) => res.json())
            .catch((err) => {
              console.log(err);
              captureException(err);
              throw new Error('Unable to retrieve account Id');
            });
        
         
          if (!accountIds.length) {
            let accountId : string;
            const isAvailable = await checkIsAccountAvailable(email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`));
            if(isAvailable){
              accountId = email.replace("@gmail.com",`.${network.fastAuth.accountIdSuffix}`)
            }else{
              accountId = email.replace("@gmail.com",publicKeyFak.replace("ed25519:","").slice(0,4).toLocaleLowerCase() + `.${network.fastAuth.accountIdSuffix}`) ;
            }
            await window.fastAuthController.setAccountId(accountId);
            await onCreateAccount(
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
                gateway:success_url,
                navigate
              }
            )
          }else{
            setStatusMessage("logging...")
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
                accountId:accountIds[0],
                recoveryPK
              }
            )
          }
      
        } catch (error) {
          console.log('error', error);
          captureException(error);
        }
      }

      
      const checkTweetAction = async(link,action,userId) =>{

        window.open(`${link}`,'popup','width=900,height=900')
        //https://twitter.com/intent/like?tweet_id=1754587117966008752
        console.log(link)
        const  runCheck = async() => {
            // consumer_key: '55dz7gtANIpYC0188vyBvdL16',
            // consumer_secret: '2085MSNLYKF58KkaGo2f0loD3HgnnRE3yd3ed4wGi8TjXeLodC',
            // access_token: '1101778597335916544-XOTpd8kPEMIlAmVdqqb027uBEaBM7S',
            // access_token_secret: 'Eb0koikOgt9VzJaW6nEEnLPpLTsdE7AVoj89OjbGm5kZm',
            const consumerKey = 'cFNlTnN1QUh6VFN3YnV4Q2NNQmI6MTpjaQ';
const consumerSecret = 'tXtNqgkAAt6nBH3JE95EUEeSNgidr3bIUL0iOKzB1E-ncuIflp';
const accessToken = '1101778597335916544-XOTpd8kPEMIlAmVdqqb027uBEaBM7S';
const accessTokenSecret = 'Eb0koikOgt9VzJaW6nEEnLPpLTsdE7AVoj89OjbGm5kZm';
const targetUser = 'target_user'; // Replace with the target user's screen name

// Encode consumer key and secret for Basic Authentication
const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
const tweetId = link.match(/(\d+)/)[0]; // Replace with the actual tweet ID

axios.get(`https://cors-anywhere.herokuapp.com/https://api.twitter.com/2/tweets/${tweetId}/liking_users`, {
    headers: {
      'Authorization': `Bearer AAAAAAAAAAAAAAAAAAAAAKYEsQEAAAAA7eSzZ%2Bcufs0%2FTi6R7V8AgdICeO0%3D5DzF7AgXayq5M0cpve8JumNQaIyEr6kAGDVyxjhjRVStn7Dvk7AAAAAAAAAAAAAAAAAAAAAKYEsQEAAAAA7eSzZ%2Bcufs0%2FTi6R7V8AgdICeO0%3D5DzF7AgXayq5M0cpve8JumNQaIyEr6kAGDVyxjhjRVStn7Dvk7`,
    },
  })
    .then(response => {
      const likedByUser = response.data.data.some(user => user.username === targetUser);

      if (likedByUser) {
        console.log(`User @${targetUser} has liked the tweet.`);
      } else {
        console.log(`User @${targetUser} has not liked the tweet.`);
      }
    })
    .catch(error => {
      console.error('Error getting liking users:', error.response.data);
    });


            
            
        }
        runCheck()
        //setTimeout(runCheck, 500)


      }
const hanleSync = async() =>{
  const accessToken = await firebaseAuth.currentUser.getIdToken()
  const recoveryPK = await window.fastAuthController.getUserCredential(accessToken);
  const accountIds = await fetch(`${network.fastAuth.authHelperUrl}/publicKey/${recoveryPK}/accounts`).then((res) => res.json())
  
  console.log("recoveryPk",recoveryPK)
  const syncActions = syncProfile({
    accountId:   "",
    accountName: "",
    accountUser:        "",
    accountPicProfile : ""
  });
 
  const gas = "300000000000000";
  const deposit = "50000000000000000000000";
  // (window as any).fastAuthController.signAndSendAddKey({
  //   contractId :"v1.social08.testnet", 
  //   methodNames:"", 
  //   allowance:"250000000000000", 
  //   publicKey:recoveryPK,
  // })
  (window as any).fastAuthController.signAndSendDelegateActionWhitelist({
    receiverId :"v1.social08.testnet",
    actions: [functionCall(
      "set",
      {
        data: {
          [accountIds[0]]: {
              profile: {
                  name:  "MPC x",
                  description: "MPC sync with ",
                  linktree: {
                      gmail: "",
                  },
                  image: {
                    ipfs_cid: ""
                  },
                  tags: {
                    BlockQuest: "",
                    near: "",
                    wallet: ""
                  }
                }
            }
        }
      
      },
      new BN(gas),
      new BN(deposit))
      ]
  })
    .then((res) => res.json())
    .then(async (res) => {
      setStatusMessage('done');
    })
    
}
    const logout = async () => {
        await firebaseAuth.signOut();
        // once it has email but not authenicated, it means existing passkey is not valid anymore, therefore remove webauthn_username and try to create a new passkey
        window.localStorage.removeItem('webauthn_username');
        window.fastAuthController.clearUser().then(() => {
        });
        navigate(0)
      }

    useEffect(()=>{
        const getData = ()=>{
            axios.get('https://cors-anywhere.herokuapp.com/https://blockquest-api.vercel.app/api/dropauth',{})
            .then((res)=>{
                setData(res&&res.data.data)
                console.log(res.data)
            })
        }
        getData();
        const getDataDetail = () =>{
            if(data){
                data.map((dt)=>{
                    //setDataDetail(dt)
                    if(dt!=undefined && dt._id==mission_id){
                        // setDataDetail(dt.)
                       
                        setName(dt.name);
                        setBackgroundCover(dt.backgroundCover);
                        setDescription(dt.description);
                        setLink(dt.link);
                        setAmount(dt.amount);
                        setStart(dt.start);
                        setEnd(dt.end);
                        setLoading(true);
                    }
                })
            }
        }
        getDataDetail()
        
    },[data])
    //console.log(name)
    //console.log(searchParams.get("mission_id"));
    return(
        <div className="background " style={{height:"100%"}}>
            <nav className="navbar navbar-expand-lg bg-body-tertiary">
            <div className="container-fluid nav-format">
                <a className="navbar-brand text-white text-decoration-none fs-4 font-weight-bold" href={window.location.origin+"/"}>Block Quest</a>
                <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse  nav-format" id="navbarSupportedContent">
                    <ul className="navbar-nav me-auto mb-2 mb-lg-0 text-decoration-none ">
                        <li className="nav-item">
                        <a className="nav-link active text-white text-decoration-none fs-6" href="/">Home</a>
                        </li>
                        <li className="nav-item text-decoration-none">
                        <a className="nav-link text-white text-decoration-none fs-6" href="/create-mission">Create Mission</a>
                        </li>
                    </ul>
                    {authenticated ? (
                      <button className="btn btn-outline-success text-white" onClick={logout}>Logout</button>
                    ) :(
                      <button className="btn text-white" onClick={(e)=>signIn("twitter")} >Login Twitter</button>
                    )}
                </div>
            </div>
            </nav>
            {loading ? (
            <div className="container py-5 container-format">
            <div className="row mb-4 ">
                <div className="col-lg-7 mx-auto d-flex flex-column">
                <img className="object-contain " width={"500px"} src={backgroundCover}/>
                    <label className="title">{name}</label>
                    <span className="desc">{description}</span>
                    <span className="time text-white">{start} - {end} 12:00 GMT+07:00 </span>
                    <span className="text-white fs-6 mt-3">Prizes: {amount} NEAR</span>
                </div>
            </div>
            {authenticated && (
            <div className="row mt-2">
            <div className="col-lg-7 mx-auto">
                <div>
                    <h3 className="fs-4 text-white">Login Twitter</h3>
                    <div className="px-3 py-2">
                    <button onClick={(e)=>signIn("twitter")} className="bg-transparent px-3 py-2 btn btn-m btn-ms text-decoration-none">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-caret-right-fill icon text-white" viewBox="0 0 16 16">
                                <path d="m12.14 8.753-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 0 1 1.659-.753l5.48 4.796a1 1 0 0 1 0 1.506z"/>
                                </svg>
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" x="0px" y="0px"  viewBox="0 0 48 48">
                                <path fill="#03A9F4" d="M42,12.429c-1.323,0.586-2.746,0.977-4.247,1.162c1.526-0.906,2.7-2.351,3.251-4.058c-1.428,0.837-3.01,1.452-4.693,1.776C34.967,9.884,33.05,9,30.926,9c-4.08,0-7.387,3.278-7.387,7.32c0,0.572,0.067,1.129,0.193,1.67c-6.138-0.308-11.582-3.226-15.224-7.654c-0.64,1.082-1,2.349-1,3.686c0,2.541,1.301,4.778,3.285,6.096c-1.211-0.037-2.351-0.374-3.349-0.914c0,0.022,0,0.055,0,0.086c0,3.551,2.547,6.508,5.923,7.181c-0.617,0.169-1.269,0.263-1.941,0.263c-0.477,0-0.942-0.054-1.392-0.135c0.94,2.902,3.667,5.023,6.898,5.086c-2.528,1.96-5.712,3.134-9.174,3.134c-0.598,0-1.183-0.034-1.761-0.104C9.268,36.786,13.152,38,17.321,38c13.585,0,21.017-11.156,21.017-20.834c0-0.317-0.01-0.633-0.025-0.945C39.763,15.197,41.013,13.905,42,12.429"></path>
                                </svg>
                                <span className="text-sm text-white">Login</span>
                            </button>
                    </div>
                </div>
            </div>
        </div>

            )}

            <div className="row mt-2">
                <div className="col-lg-7 mx-auto">
                    <div>
                        <h3 className="fs-4 text-white">Mission</h3>
                        <div className="px-3 py-2">
                            {link.map((lk,i)=>(
                                <button   onClick={()=>checkTweetAction(lk.link,lk.action,lk.userCreated)} className="bg-transparent px-3 py-2 btn btn-m btn-ms text-decoration-none"  key={i}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-caret-right-fill icon text-white" viewBox="0 0 16 16">
                                    <path d="m12.14 8.753-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 0 1 1.659-.753l5.48 4.796a1 1 0 0 1 0 1.506z"/>
                                    </svg>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" x="0px" y="0px"  viewBox="0 0 48 48">
                                    <path fill="#03A9F4" d="M42,12.429c-1.323,0.586-2.746,0.977-4.247,1.162c1.526-0.906,2.7-2.351,3.251-4.058c-1.428,0.837-3.01,1.452-4.693,1.776C34.967,9.884,33.05,9,30.926,9c-4.08,0-7.387,3.278-7.387,7.32c0,0.572,0.067,1.129,0.193,1.67c-6.138-0.308-11.582-3.226-15.224-7.654c-0.64,1.082-1,2.349-1,3.686c0,2.541,1.301,4.778,3.285,6.096c-1.211-0.037-2.351-0.374-3.349-0.914c0,0.022,0,0.055,0,0.086c0,3.551,2.547,6.508,5.923,7.181c-0.617,0.169-1.269,0.263-1.941,0.263c-0.477,0-0.942-0.054-1.392-0.135c0.94,2.902,3.667,5.023,6.898,5.086c-2.528,1.96-5.712,3.134-9.174,3.134c-0.598,0-1.183-0.034-1.761-0.104C9.268,36.786,13.152,38,17.321,38c13.585,0,21.017-11.156,21.017-20.834c0-0.317-0.01-0.633-0.025-0.945C39.763,15.197,41.013,13.905,42,12.429"></path>
                                    </svg>
                                    <span className="text-sm text-white">{lk.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="row mt-2">
                <div className="col-lg-7 mx-auto">
                    <div>
                        <h3 className="fs-4 text-white">Claim Reward</h3>
                        <div className="px-3 py-2">
                        <button onClick={hanleSync} className=" text-center btn btn-m btn-ms text-decoration-none"  >
                                    <h3 className="text-sm text-white">Claim</h3>
                                </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
            ):(
                <div className="container py-5 container-format">
                    <div className="row mt-2">
                <div className="col-lg-7 mx-auto">
                    <h3 className="text-white" >Loading</h3>
                </div>
                </div>

                </div>

            )}


        </div>
    )
}