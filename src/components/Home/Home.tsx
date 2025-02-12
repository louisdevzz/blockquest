import React,{useEffect, useState} from "react";
import axios from "axios";


export default function Home(){
    const [data, setData] = useState([]);

    useEffect(()=>{
        axios('https://cors-anywhere.herokuapp.com/https://blockquest-api.vercel.app/api/dropauth', {
            method: 'get',
            data: {},
        }).then((response) => {
            setData(response.data.data)
            console.log("res",response.data)
        }).catch((e) => {
            console.log(e);
        });
    },[])
    const text_truncate = function(str:string, length:number, ending:string) {
        if (length == null) {
          length = 100;
        }
        if (ending == null) {
          ending = '...';
        }
        if (str.length > length) {
          return str.substring(0, length - ending.length) + ending;
        } else {
          return str;
        }
      };
    
    return(
        <div className="background">
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
                    <button className="btn btn-outline-success text-white" type="submit">Login</button>
                </div>
            </div>
            </nav>
            <div className="container py-5">
                <div className="mb-3">
                    <h3 className="text-white fs-3 text-center">Campain</h3>
                </div>
                <div className="project-show ">
                    {data&&data.map((dt,i)=>(
                        <a href={`/Post?mission_id=${dt._id}`} className="card card-format text-decoration-none" key={i}>
                            <img src={dt.backgroundCover} className="card-img-top mt-2" alt="..."/>
                            <div className="card-body">
                                <h3 className="card-title text-truncate">{dt.name}</h3>
                                <p className="card-text">{text_truncate(dt.description,50,"...")}</p>
                            </div>
                        </a> 
                    ))}
                </div>
            </div>
        </div>
    )
}